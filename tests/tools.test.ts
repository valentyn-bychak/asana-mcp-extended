import { afterEach, describe, expect, it, vi } from "vitest";
import { AsanaClient } from "../src/client/asana.js";
import { toolsByName, tools } from "../src/registry.js";

// --- fetch mock helpers ----------------------------------------------------

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function mockFetch(responseData: unknown, status = 200): { captured: Captured } {
  const captured = {} as Captured;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      captured.url = url;
      captured.method = init.method!;
      captured.headers = init.headers as Record<string, string>;
      captured.body =
        typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      return new Response(JSON.stringify({ data: responseData }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return { captured };
}

function client() {
  return new AsanaClient({ token: "test-token", workspaceGid: "1203635502704309" });
}

afterEach(() => vi.unstubAllGlobals());

// --- registry --------------------------------------------------------------

describe("registry", () => {
  it("exposes the 22 tools with unique names", () => {
    // 16 P0 tools (archive/unarchive and add/remove member split out) +
    // 3 custom-field tools + 3 project-template tools.
    expect(tools.length).toBe(22);
    expect(new Set(tools.map((t) => t.name)).size).toBe(22);
  });

  it("every tool has a non-trivial description", () => {
    for (const t of tools) expect(t.description.length).toBeGreaterThan(15);
  });
});

// --- client ----------------------------------------------------------------

describe("AsanaClient", () => {
  it("sends bearer auth and wraps body in { data }", async () => {
    const { captured } = mockFetch({ gid: "1" });
    await client().request("PUT", "/projects/99", { name: "X" });
    expect(captured.headers.Authorization).toBe("Bearer test-token");
    expect(captured.body).toEqual({ data: { name: "X" } });
    expect(captured.url).toBe("https://app.asana.com/api/1.0/projects/99");
  });

  it("unwraps the data envelope from responses", async () => {
    mockFetch({ gid: "42", name: "hi" });
    const out = await client().request("GET", "/projects/42");
    expect(out).toEqual({ gid: "42", name: "hi" });
  });

  it("throws a readable error carrying Asana's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ errors: [{ message: "Not a valid project" }] }), {
            status: 404,
          }),
      ),
    );
    await expect(client().request("GET", "/projects/bad")).rejects.toThrow(
      /Not a valid project/,
    );
  });

  it("retries once on 429 then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1)
          return new Response("{}", { status: 429, headers: { "Retry-After": "0" } });
        return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
      }),
    );
    const out = await client().request("GET", "/x");
    expect(calls).toBe(2);
    expect(out).toEqual({ ok: true });
  });

  it("appends query params, skipping undefined", async () => {
    const { captured } = mockFetch([]);
    await toolsByName.get("get_time_tracking_entries")!.handler(client(), {
      task_id: "7",
    });
    expect(captured.url).toContain("/tasks/7/time_tracking_entries");
    expect(captured.url).toContain("opt_fields=");
  });
});

// --- individual tool request shaping --------------------------------------

describe("tool handlers build correct requests", () => {
  it("create_section posts to project sections with insert_after", async () => {
    const { captured } = mockFetch({ gid: "s1" });
    await toolsByName.get("create_section")!.handler(client(), {
      project_id: "P",
      name: "🚀 Магазин",
      insert_after: "s0",
    });
    expect(captured.method).toBe("POST");
    expect(captured.url).toBe("https://app.asana.com/api/1.0/projects/P/sections");
    expect(captured.body).toEqual({ data: { name: "🚀 Магазин", insert_after: "s0" } });
  });

  it("reorder_task_in_section hits section addTask", async () => {
    const { captured } = mockFetch({});
    await toolsByName.get("reorder_task_in_section")!.handler(client(), {
      section_id: "S",
      task_id: "T",
      insert_before: "T2",
    });
    expect(captured.url).toBe("https://app.asana.com/api/1.0/sections/S/addTask");
    expect(captured.body).toEqual({ data: { task: "T", insert_before: "T2" } });
  });

  it("reorder_task_in_section rejects both insert_before and insert_after", () => {
    const tool = toolsByName.get("reorder_task_in_section")!;
    const res = tool.schema.safeParse({
      section_id: "S",
      task_id: "T",
      insert_before: "a",
      insert_after: "b",
    });
    expect(res.success).toBe(false);
  });

  it("update_project drops undefined fields and keeps provided ones", async () => {
    const { captured } = mockFetch({ gid: "P" });
    await toolsByName.get("update_project")!.handler(client(), {
      project_id: "P",
      name: "New name",
      notes: "desc",
    });
    expect(captured.method).toBe("PUT");
    expect(captured.body).toEqual({ data: { name: "New name", notes: "desc" } });
  });

  it("update_project rejects notes + html_notes together", () => {
    const res = toolsByName.get("update_project")!.schema.safeParse({
      project_id: "P",
      notes: "a",
      html_notes: "<b>b</b>",
    });
    expect(res.success).toBe(false);
  });

  it("archive_project sets archived true", async () => {
    const { captured } = mockFetch({});
    await toolsByName.get("archive_project")!.handler(client(), { project_id: "P" });
    expect(captured.body).toEqual({ data: { archived: true } });
  });

  it("add_project_member joins user ids into members CSV", async () => {
    const { captured } = mockFetch({});
    await toolsByName.get("add_project_member")!.handler(client(), {
      project_id: "P",
      user_ids: ["u1", "u2"],
    });
    expect(captured.url).toContain("/projects/P/addMembers");
    expect(captured.body).toEqual({ data: { members: "u1,u2" } });
  });

  it("add_time_tracking_entry posts duration_minutes", async () => {
    const { captured } = mockFetch({ gid: "e1" });
    await toolsByName.get("add_time_tracking_entry")!.handler(client(), {
      task_id: "T",
      duration_minutes: 90,
    });
    expect(captured.url).toContain("/tasks/T/time_tracking_entries");
    expect(captured.body).toEqual({ data: { duration_minutes: 90 } });
  });

  it("add_time_tracking_entry rejects non-positive duration", () => {
    const res = toolsByName.get("add_time_tracking_entry")!.schema.safeParse({
      task_id: "T",
      duration_minutes: 0,
    });
    expect(res.success).toBe(false);
  });

  it("delete_attachment issues DELETE and reports success", async () => {
    const { captured } = mockFetch({});
    const out = await toolsByName.get("delete_attachment")!.handler(client(), {
      attachment_id: "A",
    });
    expect(captured.method).toBe("DELETE");
    expect(captured.url).toContain("/attachments/A");
    expect(out).toEqual({ deleted: true, attachment_id: "A" });
  });

  it("update_time_tracking_entry requires at least one field", () => {
    const res = toolsByName.get("update_time_tracking_entry")!.schema.safeParse({
      entry_id: "E",
    });
    expect(res.success).toBe(false);
  });

  it("add_custom_field_to_project posts addCustomFieldSetting with is_important default", async () => {
    const { captured } = mockFetch({ gid: "cfs1" });
    await toolsByName.get("add_custom_field_to_project")!.handler(client(), {
      project_id: "P",
      custom_field_id: "1205533106065244",
    });
    expect(captured.url).toContain("/projects/P/addCustomFieldSetting");
    expect(captured.body).toEqual({
      data: { custom_field: "1205533106065244", is_important: true },
    });
  });

  it("list_workspace_custom_fields uses default workspace and filters by name", async () => {
    const { captured } = mockFetch([
      { gid: "1", name: "Estimated time", type: "number" },
      { gid: "2", name: "Priority", type: "enum" },
    ]);
    const out = await toolsByName.get("list_workspace_custom_fields")!.handler(client(), {
      name_contains: "estimat",
    });
    expect(captured.url).toContain("/workspaces/1203635502704309/custom_fields");
    expect(out).toEqual([{ gid: "1", name: "Estimated time", type: "number" }]);
  });

  it("create_project_from_template instantiates and returns the new project", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method!,
          body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
        });
        // 1st call: instantiate → job with new_project inline
        if (url.includes("/instantiateProject")) {
          return new Response(
            JSON.stringify({ data: { gid: "job1", new_project: { gid: "newP" }, status: "in_progress" } }),
            { status: 200 },
          );
        }
        // project fetch
        return new Response(
          JSON.stringify({ data: { name: "Weekly plan", permalink_url: "https://app.asana.com/x" } }),
          { status: 200 },
        );
      }),
    );
    const out: any = await toolsByName.get("create_project_from_template")!.handler(client(), {
      template_id: "TPL",
      name: "Weekly plan",
      team_id: "TEAM",
    });
    const inst = calls.find((c) => c.url.includes("/instantiateProject"))!;
    expect(inst.method).toBe("POST");
    expect(inst.url).toContain("/project_templates/TPL/instantiateProject");
    expect(inst.body).toEqual({ data: { name: "Weekly plan", public: false, team: "TEAM" } });
    expect(out.project_gid).toBe("newP");
    expect(out.permalink_url).toBe("https://app.asana.com/x");
  });
});
