import { z } from "zod";
import { defineTool } from "./types.js";
import type { AsanaClient } from "../client/asana.js";

// --- date helpers (local time) --------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

async function search(
  client: AsanaClient,
  params: Record<string, string>,
): Promise<any[]> {
  const ws = client.defaultWorkspace;
  if (!ws) throw new Error("No default workspace configured");
  return client.request<any[]>(
    "GET",
    `/workspaces/${ws}/tasks/search`,
    undefined,
    { ...params, limit: "100" },
  );
}

/**
 * Build the assignee/project scope filter for the search endpoint.
 * Either filter (or both) may be set. project_id is useful when a whole
 * project represents one person's work even if tasks aren't all assigned to them.
 */
function scopeFilter(user_id?: string, project_id?: string): Record<string, string> {
  const f: Record<string, string> = {};
  if (user_id) f["assignee.any"] = user_id;
  if (project_id) f["projects.any"] = project_id;
  return f;
}

async function scopeLabel(client: AsanaClient, user_id?: string, project_id?: string): Promise<string> {
  if (project_id) {
    const p = await client.request<any>("GET", `/projects/${project_id}`, undefined, { opt_fields: "name" });
    return `проект «${p?.name ?? project_id}»`;
  }
  if (user_id && user_id !== "me") {
    const u = await client.request<any>("GET", `/users/${user_id}`, undefined, { opt_fields: "name" }).catch(() => null);
    return u?.name ? u.name : "користувач";
  }
  return "я";
}

const fmtList = (tasks: any[]) =>
  tasks.length
    ? tasks
        .map((t) => `- ${t.name}${t.due_on ? ` _(due ${t.due_on})_` : ""} — ${t.permalink_url}`)
        .join("\n")
    : "_— немає —_";

export const standupReport = defineTool({
  name: "standup_report",
  description:
    "Daily stand-up report for a user: tasks completed yesterday + tasks due today (incomplete). " +
    "Returns ready-to-send markdown plus structured data. Pass 'me' or a user gid; optional date " +
    "(YYYY-MM-DD) sets 'today' (default = actual today).",
  schema: z
    .object({
      user_id: z.string().optional().describe("'me' or a user gid"),
      project_id: z.string().optional().describe("report on a whole project's tasks instead of/with an assignee"),
      date: z.string().optional().describe("reference 'today' as YYYY-MM-DD (default: today)"),
    })
    .refine((v) => !!v.user_id || !!v.project_id, { message: "Provide user_id and/or project_id" }),
  handler: async (client, input) => {
    const today = input.date ? new Date(input.date + "T12:00:00") : new Date();
    const todayStart = startOfDay(today);
    const yesterdayStart = addDays(todayStart, -1);
    const fields = "name,due_on,permalink_url,completed_at,assignee.name";
    const scope = scopeFilter(input.user_id, input.project_id);

    const [done, plan] = await Promise.all([
      search(client, {
        ...scope,
        completed: "true",
        "completed_at.after": yesterdayStart.toISOString(),
        "completed_at.before": todayStart.toISOString(),
        opt_fields: fields,
      }),
      search(client, {
        ...scope,
        completed: "false",
        due_on: dayStr(todayStart),
        opt_fields: fields,
      }),
    ]);

    const markdown =
      `*Звіт за ${dayStr(yesterdayStart)} → план на ${dayStr(todayStart)}*\n\n` +
      `✅ *Виконано вчора (${dayStr(yesterdayStart)}):*\n${fmtList(done)}\n\n` +
      `📋 *Заплановано на сьогодні (${dayStr(todayStart)}):*\n${fmtList(plan)}`;

    return {
      done_yesterday: done.map((t) => ({ name: t.name, url: t.permalink_url })),
      due_today: plan.map((t) => ({ name: t.name, url: t.permalink_url })),
      markdown,
    };
  },
});

export const weeklyReport = defineTool({
  name: "weekly_report",
  description:
    "Weekly report for a user: tasks completed in the last 7 days (or a given week) and tasks " +
    "still open & overdue. Returns ready-to-send markdown plus structured data.",
  schema: z
    .object({
      user_id: z.string().optional().describe("'me' or a user gid"),
      project_id: z
        .string()
        .optional()
        .describe("report on a whole project's tasks (use when a project = a person's work)"),
      week_start: z
        .string()
        .optional()
        .describe("start of the week (YYYY-MM-DD); default = 7 days ago"),
    })
    .refine((v) => !!v.user_id || !!v.project_id, { message: "Provide user_id and/or project_id" }),
  handler: async (client, input) => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const start = input.week_start ? startOfDay(new Date(input.week_start + "T12:00:00")) : addDays(todayStart, -7);
    const end = input.week_start ? addDays(start, 7) : addDays(todayStart, 1);
    const fields = "name,due_on,permalink_url,completed_at,assignee.name,projects.name";
    const scope = scopeFilter(input.user_id, input.project_id);
    const label = await scopeLabel(client, input.user_id, input.project_id);

    const [done, overdue] = await Promise.all([
      search(client, {
        ...scope,
        completed: "true",
        "completed_at.after": start.toISOString(),
        "completed_at.before": end.toISOString(),
        opt_fields: fields,
      }),
      search(client, {
        ...scope,
        completed: "false",
        "due_on.before": dayStr(todayStart),
        opt_fields: fields,
      }),
    ]);

    // due_on.before is inclusive in Asana — keep only strictly past-due (before today).
    const overdueOpen = overdue.filter((t) => t.due_on && t.due_on < dayStr(todayStart));

    const markdown =
      `*Тижневий звіт — ${label} (${dayStr(start)} → ${dayStr(addDays(end, -1))})*\n\n` +
      `✅ *Виконано (${done.length}):*\n${fmtList(done)}\n\n` +
      `⚠️ *Протерміновано й досі відкрито (${overdueOpen.length}):*\n${fmtList(overdueOpen)}`;

    return {
      completed_count: done.length,
      completed: done.map((t) => ({ name: t.name, url: t.permalink_url })),
      overdue_count: overdueOpen.length,
      overdue: overdueOpen.map((t) => ({ name: t.name, due_on: t.due_on, url: t.permalink_url })),
      markdown,
    };
  },
});

export const reportTools = [standupReport, weeklyReport];
