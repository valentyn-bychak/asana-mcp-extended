// Live integration run against the real Asana workspace.
// Creates an isolated sandbox project, exercises every P0 tool, cleans up.
// Run: node --env-file=.env tests/integration.mjs   (after `npm run build`)
import { writeFile, unlink } from "node:fs/promises";
import { AsanaClient } from "../dist/client/asana.js";
import { toolsByName } from "../dist/registry.js";

const client = new AsanaClient({
  token: process.env.ASANA_PERSONAL_ACCESS_TOKEN ?? "",
  workspaceGid: process.env.ASANA_WORKSPACE_GID,
});
const ws = process.env.ASANA_WORKSPACE_GID;
const call = (name, args) => toolsByName.get(name).handler(client, args);
const log = (label, v) => console.log(`✅ ${label}:`, JSON.stringify(v));

let projectGid, taskGid, tmpFile;
const fail = [];

try {
  // --- scaffold: sandbox project + task (uses raw client; not a P0 tool) ---
  const project = await client.request("POST", "/projects", {
    workspace: ws,
    name: "🧪 MCP Sandbox (auto, safe to delete)",
  });
  projectGid = project.gid;
  log("create sandbox project", { gid: projectGid });

  const task = await client.request("POST", "/tasks", {
    workspace: ws,
    name: "MCP test task",
    projects: [projectGid],
  });
  taskGid = task.gid;
  log("create sandbox task", { gid: taskGid });

  // --- sections ---
  const sec = await call("create_section", { project_id: projectGid, name: "🚀 Section A" });
  log("create_section", { gid: sec.gid, name: sec.name });

  const sec2 = await call("create_section", { project_id: projectGid, name: "Section B" });

  await call("update_section", { section_id: sec.gid, name: "🚀 Section A (renamed)" });
  log("update_section", "renamed");

  await call("reorder_section_in_project", {
    project_id: projectGid, section_id: sec2.gid, before_section: sec.gid,
  });
  log("reorder_section_in_project", "B before A");

  await call("reorder_task_in_section", { section_id: sec.gid, task_id: taskGid });
  log("reorder_task_in_section", "task moved into Section A");

  // --- attachment ---
  tmpFile = "/tmp/mcp-test-attachment.txt";
  await writeFile(tmpFile, "hello from asana-mcp-extended integration test\n");
  const att = await call("add_attachment", { task_id: taskGid, file_path: tmpFile });
  log("add_attachment", { gid: att.gid, name: att.name });
  await call("delete_attachment", { attachment_id: att.gid });
  log("delete_attachment", "ok");

  // --- project update ---
  const upd = await call("update_project", {
    project_id: projectGid, name: "🧪 MCP Sandbox (renamed)", notes: "updated by integration test",
  });
  log("update_project", { name: upd.name });

  await call("archive_project", { project_id: projectGid });
  await call("unarchive_project", { project_id: projectGid });
  log("archive/unarchive_project", "ok");

  // --- members ---
  // NOTE: removing yourself from a project revokes your access to it
  // ("You do not have access"), so we exercise members on a DEDICATED throwaway
  // project — never on the main sandbox we still need below.
  const me = await client.request("GET", "/users/me");
  try {
    const mp = await client.request("POST", "/projects", {
      workspace: ws, name: "🧪 MCP member-test (auto)",
    });
    await call("add_project_member", { project_id: mp.gid, user_ids: [me.gid] });
    await call("remove_project_member", { project_id: mp.gid, user_ids: [me.gid] });
    log("add/remove_project_member", "ok");
    // best-effort cleanup; after self-removal we may have lost access (expected)
    await client.request("DELETE", `/projects/${mp.gid}`).catch(() => {});
  } catch (e) {
    fail.push(`members: ${e.message}`);
  }

  // --- time tracking (needs Advanced+) ---
  try {
    const entry = await call("add_time_tracking_entry", { task_id: taskGid, duration_minutes: 90 });
    log("add_time_tracking_entry", { gid: entry.gid, duration_minutes: entry.duration_minutes });
    const entries = await call("get_time_tracking_entries", { task_id: taskGid });
    log("get_time_tracking_entries", { count: entries.length });
    await call("update_time_tracking_entry", { entry_id: entry.gid, duration_minutes: 120 });
    log("update_time_tracking_entry", "→ 120 min");
    await call("delete_time_tracking_entry", { entry_id: entry.gid });
    log("delete_time_tracking_entry", "ok");
  } catch (e) {
    fail.push(`time_tracking: ${e.message}`);
  }

  // --- section delete ---
  await call("delete_section", { section_id: sec2.gid });
  log("delete_section", "Section B deleted");
} catch (e) {
  fail.push(`FATAL: ${e.message}`);
  console.error("❌", e);
} finally {
  // cleanup
  if (tmpFile) await unlink(tmpFile).catch(() => {});
  if (projectGid) {
    await client.request("DELETE", `/projects/${projectGid}`).catch((e) => fail.push(`cleanup project: ${e.message}`));
    console.log("🧹 deleted sandbox project");
  }
}

console.log("\n=== RESULT ===");
if (fail.length) { console.log("issues:\n" + fail.map((f) => " - " + f).join("\n")); process.exit(1); }
else console.log("all P0 tools exercised live ✅");
