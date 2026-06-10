import { z } from "zod";
import { defineTool } from "./types.js";
import { compact } from "./helpers.js";

export const createProject = defineTool({
  name: "create_project",
  description:
    "Create a project from scratch. PREFER create_project_from_template for real OLD PRESS " +
    "projects (it carries native Time tracking + standard structure). A team is required in an " +
    "organization workspace.",
  schema: z.object({
    name: z.string(),
    team_id: z.string().optional().describe("team gid (required in org workspaces)"),
    workspace_id: z.string().optional(),
    notes: z.string().optional(),
    color: z.string().optional(),
    default_view: z.enum(["list", "board", "calendar", "timeline", "gantt"]).optional(),
    privacy_setting: z.enum(["public_to_workspace", "private_to_team", "private"]).optional(),
  }),
  handler: (client, input) => {
    const wsId = input.workspace_id ?? client.defaultWorkspace;
    return client.request("POST", "/projects", compact({
      name: input.name,
      team: input.team_id,
      workspace: input.team_id ? undefined : wsId,
      notes: input.notes,
      color: input.color,
      default_view: input.default_view,
      privacy_setting: input.privacy_setting,
    }));
  },
});

export const createTasks = defineTool({
  name: "create_tasks",
  description:
    "Create one or more tasks. Each task may set project_id + section_id (placed in that section), " +
    "parent (subtask), assignee, notes/html_notes, due_on/start_on, custom_fields (map of fieldGid→value), " +
    "and resource_subtype (default_task/milestone). Returns the created tasks.",
  schema: z.object({
    tasks: z
      .array(
        z.object({
          name: z.string(),
          project_id: z.string().optional(),
          section_id: z.string().optional().describe("requires project_id"),
          parent_id: z.string().optional().describe("create as a subtask of this task"),
          assignee: z.string().optional().describe("'me', email, or user gid"),
          notes: z.string().optional(),
          html_notes: z.string().optional(),
          due_on: z.string().optional().describe("YYYY-MM-DD"),
          start_on: z.string().optional().describe("YYYY-MM-DD"),
          resource_subtype: z.enum(["default_task", "milestone"]).optional(),
          custom_fields: z.record(z.string(), z.any()).optional().describe("map fieldGid → value"),
          workspace_id: z.string().optional(),
        }),
      )
      .min(1)
      .max(50),
  }),
  handler: async (client, input) => {
    const created: any[] = [];
    for (const t of input.tasks) {
      const body: Record<string, unknown> = compact({
        name: t.name,
        parent: t.parent_id,
        assignee: t.assignee,
        notes: t.notes,
        html_notes: t.html_notes,
        due_on: t.due_on,
        start_on: t.start_on,
        resource_subtype: t.resource_subtype,
        custom_fields: t.custom_fields,
      });
      // Placement: a task needs a project/parent/workspace home.
      // NOTE: Asana's POST /tasks rejects `memberships` ("specify one of workspace,
      // parent, projects") — it can't place a task into a section at creation time.
      // So we create the task in the project, then move it into the section with a
      // second addProject call (the same path add_task_to_project uses).
      let pendingSection: string | undefined;
      if (t.project_id) {
        body.projects = [t.project_id];
        if (t.section_id) pendingSection = t.section_id;
      } else if (!t.parent_id) {
        body.workspace = t.workspace_id ?? client.defaultWorkspace;
      }
      const r = await client.request<any>("POST", "/tasks", body, { opt_fields: "name,permalink_url" });
      if (pendingSection) {
        await client.request("POST", `/tasks/${r.gid}/addProject`, {
          project: t.project_id,
          section: pendingSection,
        });
      }
      created.push({ gid: r.gid, name: r.name, permalink_url: r.permalink_url });
    }
    return { created_count: created.length, tasks: created };
  },
});

export const updateTask = defineTool({
  name: "update_task",
  description:
    "Update a task's fields: name, notes/html_notes, assignee (null/'' to unassign), due_on/start_on, " +
    "completed, and custom_fields (map fieldGid→value). Only provided fields change.",
  schema: z
    .object({
      task_id: z.string(),
      name: z.string().optional(),
      notes: z.string().optional(),
      html_notes: z.string().optional(),
      assignee: z.string().optional().describe("'me'/gid, or empty string to unassign"),
      due_on: z.string().optional().describe("YYYY-MM-DD"),
      start_on: z.string().optional().describe("YYYY-MM-DD (due_on must also be set)"),
      completed: z.boolean().optional(),
      custom_fields: z.record(z.string(), z.any()).optional(),
    })
    .refine((v) => Object.keys(v).length > 1, { message: "Provide at least one field to update" }),
  handler: (client, input) => {
    const { task_id, assignee, ...rest } = input;
    const data: Record<string, unknown> = compact(rest);
    if (assignee !== undefined) data.assignee = assignee === "" ? null : assignee;
    return client.request("PUT", `/tasks/${task_id}`, data, { opt_fields: "name,completed,assignee.name,due_on" });
  },
});

export const addTaskToProject = defineTool({
  name: "add_task_to_project",
  description:
    "Add a task to a project (multi-home — keeps it in its other projects), optionally into a " +
    "specific section. Used for weekly planning (multi-home into a person's weekly-plan project).",
  schema: z.object({
    task_id: z.string(),
    project_id: z.string(),
    section_id: z.string().optional(),
  }),
  handler: async (client, input) => {
    await client.request("POST", `/tasks/${input.task_id}/addProject`, compact({
      project: input.project_id,
      section: input.section_id,
    }));
    return { ok: true, task_id: input.task_id, project_id: input.project_id, section_id: input.section_id ?? null };
  },
});

export const removeTaskFromProject = defineTool({
  name: "remove_task_from_project",
  description: "Remove a task from a project (it stays in its other projects).",
  schema: z.object({ task_id: z.string(), project_id: z.string() }),
  handler: async (client, input) => {
    await client.request("POST", `/tasks/${input.task_id}/removeProject`, { project: input.project_id });
    return { ok: true, task_id: input.task_id, project_id: input.project_id };
  },
});

export const addComment = defineTool({
  name: "add_comment",
  description: "Add a comment to a task. Use html_text for rich formatting/@-mentions.",
  schema: z
    .object({
      task_id: z.string(),
      text: z.string().optional(),
      html_text: z.string().optional(),
    })
    .refine((v) => !!v.text || !!v.html_text, { message: "Provide text or html_text" }),
  handler: (client, input) =>
    client.request("POST", `/tasks/${input.task_id}/stories`, compact({
      text: input.text,
      html_text: input.html_text,
    })),
});

export const deleteTask = defineTool({
  name: "delete_task",
  description: "Delete a task (and its subtasks not in another project). Use with care.",
  schema: z.object({ task_id: z.string() }),
  handler: async (client, input) => {
    await client.request("DELETE", `/tasks/${input.task_id}`);
    return { deleted: true, task_id: input.task_id };
  },
});

export const coreWriteTools = [
  createProject, createTasks, updateTask, addTaskToProject, removeTaskFromProject, addComment, deleteTask,
];
