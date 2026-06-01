import { z } from "zod";
import { defineTool } from "./types.js";
import { resolveJobResource, compact } from "./helpers.js";

export const duplicateProject = defineTool({
  name: "duplicate_project",
  description:
    "Duplicate an existing project. Returns the new project gid. Use `include` to control what " +
    "gets copied (defaults to a sensible full copy of structure and task fields).",
  schema: z.object({
    project_id: z.string().describe("gid of the project to duplicate"),
    name: z.string().describe("name for the new project"),
    team_id: z.string().optional().describe("team for the new project; defaults to the source's team"),
    include: z
      .array(
        z.enum([
          "members", "notes", "forms", "task_notes", "task_assignee", "task_subtasks",
          "task_attachments", "task_dates", "task_dependencies", "task_followers",
          "task_tags", "task_projects",
        ]),
      )
      .optional()
      .describe("what to copy; omit for a full structural copy"),
  }),
  handler: async (client, input) => {
    const body: Record<string, unknown> = compact({ name: input.name, team: input.team_id });
    body.include = (input.include && input.include.length
      ? input.include
      : ["members", "notes", "task_notes", "task_assignee", "task_subtasks", "task_dates", "task_dependencies", "task_tags"]
    ).join(",");
    const job = await client.request<any>("POST", `/projects/${input.project_id}/duplicate`, body);
    const { gid, status } = await resolveJobResource(client, job, "new_project");
    const project = await client.request<any>("GET", `/projects/${gid}`, undefined, {
      opt_fields: "name,permalink_url",
    });
    return { project_gid: gid, name: project?.name, permalink_url: project?.permalink_url, job_status: status };
  },
});

export const addFollowersToProject = defineTool({
  name: "add_followers_to_project",
  description: "Add followers (users) to a project. Followers get notifications about the project.",
  schema: z.object({
    project_id: z.string(),
    user_ids: z.array(z.string()).min(1).describe("user gids or 'me'"),
  }),
  handler: (client, input) =>
    client.request("POST", `/projects/${input.project_id}/addFollowers`, {
      followers: input.user_ids.join(","),
    }),
});

export const sortSectionTasksByDueDate = defineTool({
  name: "sort_section_tasks_by_due_date",
  description:
    "Reorder all tasks in a section by due date. Tasks without a due date go to the bottom by " +
    "default (or top). Direction asc (earliest first) by default.",
  schema: z.object({
    section_id: z.string(),
    direction: z.enum(["asc", "desc"]).optional().describe("default asc (earliest first)"),
    nulls_position: z.enum(["top", "bottom"]).optional().describe("where to put tasks with no due date (default bottom)"),
  }),
  handler: async (client, input) => {
    const dir = input.direction ?? "asc";
    const nulls = input.nulls_position ?? "bottom";
    const tasks = await client.request<any[]>(
      "GET",
      `/sections/${input.section_id}/tasks`,
      undefined,
      { opt_fields: "name,due_on", limit: "100" },
    );
    const cmp = (a: any, b: any) => {
      const da = a.due_on, db = b.due_on;
      if (!da && !db) return 0;
      if (!da) return nulls === "bottom" ? 1 : -1;
      if (!db) return nulls === "bottom" ? -1 : 1;
      return dir === "asc" ? da.localeCompare(db) : db.localeCompare(da);
    };
    const sorted = [...tasks].sort(cmp);
    for (let i = 0; i < sorted.length; i++) {
      const body: Record<string, unknown> =
        i === 0 ? { task: sorted[i].gid } : { task: sorted[i].gid, insert_after: sorted[i - 1].gid };
      await client.request("POST", `/sections/${input.section_id}/addTask`, body);
    }
    return {
      section_id: input.section_id,
      sorted_count: sorted.length,
      order: sorted.map((t) => ({ name: t.name, due_on: t.due_on ?? null })),
    };
  },
});

export const projectExtraTools = [duplicateProject, addFollowersToProject, sortSectionTasksByDueDate];
