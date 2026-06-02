import { z } from "zod";
import { defineTool } from "./types.js";
import { compact } from "./helpers.js";

const ws = (client: any, given?: string) => {
  const w = given ?? client.defaultWorkspace;
  if (!w) throw new Error("workspace_id required (set ASANA_WORKSPACE_GID or pass workspace_id)");
  return w;
};

const TASK_FIELDS =
  "name,notes,completed,assignee.name,due_on,start_on,permalink_url," +
  "custom_fields.name,custom_fields.display_value,projects.name,parent.name," +
  "memberships.section.name,memberships.project.name,tags.name,actual_time_minutes";

export const getMe = defineTool({
  name: "get_me",
  description:
    "Get the current user (the token owner): name, email, and the workspaces they belong to " +
    "(with gids). Run this to find your workspace gid for ASANA_WORKSPACE_GID.",
  schema: z.object({}),
  handler: (client) =>
    client.request("GET", "/users/me", undefined, { opt_fields: "name,email,workspaces.name" }),
});

export const getUsers = defineTool({
  name: "get_users",
  description: "List users in a workspace (name, email, gid). Use to find an assignee's gid.",
  schema: z.object({ workspace_id: z.string().optional() }),
  handler: (client, input) =>
    client.request("GET", `/workspaces/${ws(client, input.workspace_id)}/users`, undefined, {
      opt_fields: "name,email",
      limit: "100",
    }),
});

export const getUser = defineTool({
  name: "get_user",
  description: "Get a single user's details by gid (or 'me').",
  schema: z.object({ user_id: z.string() }),
  handler: (client, input) =>
    client.request("GET", `/users/${input.user_id}`, undefined, { opt_fields: "name,email,workspaces.name" }),
});

export const getTeams = defineTool({
  name: "get_teams",
  description: "List the teams the current user belongs to in a workspace (name + gid).",
  schema: z.object({ workspace_id: z.string().optional() }),
  handler: (client, input) =>
    client.request("GET", "/users/me/teams", undefined, {
      organization: ws(client, input.workspace_id),
      opt_fields: "name",
    }),
});

export const getProjects = defineTool({
  name: "get_projects",
  description: "List projects in a workspace or team. Excludes archived unless include_archived.",
  schema: z.object({
    workspace_id: z.string().optional(),
    team_id: z.string().optional().describe("scope to one team"),
    include_archived: z.boolean().optional(),
  }),
  handler: (client, input) =>
    client.request("GET", "/projects", undefined, compact({
      workspace: input.team_id ? undefined : ws(client, input.workspace_id),
      team: input.team_id,
      archived: input.include_archived ? undefined : "false",
      opt_fields: "name,archived,owner.name,current_status.title",
      limit: "100",
    }) as Record<string, string>),
});

export const getProject = defineTool({
  name: "get_project",
  description: "Get a project's details, optionally with its sections.",
  schema: z.object({
    project_id: z.string(),
    include_sections: z.boolean().optional(),
  }),
  handler: async (client, input) => {
    const project = await client.request<any>("GET", `/projects/${input.project_id}`, undefined, {
      opt_fields: "name,notes,archived,color,owner.name,current_status.title,members.name,due_on,start_on,permalink_url",
    });
    if (input.include_sections) {
      const sections = await client.request<any[]>(
        "GET",
        `/projects/${input.project_id}/sections`,
        undefined,
        { opt_fields: "name" },
      );
      project.sections = sections.map((s) => ({ gid: s.gid, name: s.name }));
    }
    return project;
  },
});

export const getSections = defineTool({
  name: "get_sections",
  description: "List a project's sections (gid + name) in display order.",
  schema: z.object({ project_id: z.string() }),
  handler: (client, input) =>
    client.request("GET", `/projects/${input.project_id}/sections`, undefined, { opt_fields: "name" }),
});

export const getTask = defineTool({
  name: "get_task",
  description: "Get full details of a task by gid (fields, custom fields, projects, sections, tags).",
  schema: z.object({ task_id: z.string() }),
  handler: (client, input) =>
    client.request("GET", `/tasks/${input.task_id}`, undefined, { opt_fields: TASK_FIELDS }),
});

export const getTasks = defineTool({
  name: "get_tasks",
  description:
    "List tasks in a context: provide exactly one of project_id, section_id, tag_id, or " +
    "assignee (with workspace). Returns names, due dates, completion and key fields.",
  schema: z
    .object({
      project_id: z.string().optional(),
      section_id: z.string().optional(),
      tag_id: z.string().optional(),
      assignee: z.string().optional().describe("'me' or user gid (requires workspace)"),
      workspace_id: z.string().optional(),
      include_completed: z.boolean().optional().describe("default false → only incomplete (assignee mode)"),
    })
    .refine(
      (v) => [v.project_id, v.section_id, v.tag_id, v.assignee].filter(Boolean).length === 1,
      { message: "Provide exactly one of project_id, section_id, tag_id, or assignee" },
    ),
  handler: (client, input) => {
    const q: Record<string, string> = { opt_fields: TASK_FIELDS, limit: "100" };
    let path = "/tasks";
    if (input.project_id) q.project = input.project_id;
    else if (input.section_id) path = `/sections/${input.section_id}/tasks`;
    else if (input.tag_id) path = `/tags/${input.tag_id}/tasks`;
    else if (input.assignee) {
      q.assignee = input.assignee;
      q.workspace = ws(client, input.workspace_id);
      if (!input.include_completed) q.completed_since = "now";
    }
    return client.request("GET", path, undefined, q);
  },
});

export const searchTasks = defineTool({
  name: "search_tasks",
  description:
    "Search tasks across the workspace (premium search; Advanced plan). Combine free text and " +
    "filters: assignee, project, completed, due-date window. Returns matching tasks.",
  schema: z.object({
    text: z.string().optional().describe("free-text match on task name/notes"),
    assignee_id: z.string().optional().describe("'me' or user gid"),
    project_id: z.string().optional(),
    completed: z.boolean().optional(),
    due_after: z.string().optional().describe("YYYY-MM-DD (inclusive)"),
    due_before: z.string().optional().describe("YYYY-MM-DD (inclusive)"),
    workspace_id: z.string().optional(),
  }),
  handler: (client, input) =>
    client.request("GET", `/workspaces/${ws(client, input.workspace_id)}/tasks/search`, undefined, compact({
      text: input.text,
      "assignee.any": input.assignee_id,
      "projects.any": input.project_id,
      completed: input.completed === undefined ? undefined : String(input.completed),
      "due_on.after": input.due_after,
      "due_on.before": input.due_before,
      opt_fields: TASK_FIELDS,
      limit: "100",
    }) as Record<string, string>),
});

export const getMyTasks = defineTool({
  name: "get_my_tasks",
  description: "List a user's My Tasks (incomplete by default). Pass 'me' or a user gid.",
  schema: z.object({
    user_id: z.string().default("me"),
    workspace_id: z.string().optional(),
    include_completed: z.boolean().optional(),
  }),
  handler: (client, input) =>
    client.request("GET", "/tasks", undefined, compact({
      assignee: input.user_id ?? "me",
      workspace: ws(client, input.workspace_id),
      completed_since: input.include_completed ? undefined : "now",
      opt_fields: TASK_FIELDS,
      limit: "100",
    }) as Record<string, string>),
});

export const getAttachments = defineTool({
  name: "get_attachments",
  description: "List attachments on a task (name, type, download url).",
  schema: z.object({ task_id: z.string() }),
  handler: (client, input) =>
    client.request("GET", "/attachments", undefined, {
      parent: input.task_id,
      opt_fields: "name,resource_subtype,download_url,host",
    }),
});

export const getPortfolios = defineTool({
  name: "get_portfolios",
  description: "List portfolios owned by a user in a workspace (default owner = me).",
  schema: z.object({
    workspace_id: z.string().optional(),
    owner_id: z.string().optional().describe("default 'me'"),
  }),
  handler: (client, input) =>
    client.request("GET", "/portfolios", undefined, {
      workspace: ws(client, input.workspace_id),
      owner: input.owner_id ?? "me",
      opt_fields: "name,color",
      limit: "100",
    }),
});

export const getPortfolioItems = defineTool({
  name: "get_portfolio_items",
  description: "List the items (projects/portfolios) inside a portfolio.",
  schema: z.object({ portfolio_id: z.string() }),
  handler: (client, input) =>
    client.request("GET", `/portfolios/${input.portfolio_id}/items`, undefined, {
      opt_fields: "name,resource_type",
    }),
});

export const coreReadTools = [
  getMe, getUsers, getUser, getTeams, getProjects, getProject, getSections,
  getTask, getTasks, searchTasks, getMyTasks, getAttachments, getPortfolios, getPortfolioItems,
];
