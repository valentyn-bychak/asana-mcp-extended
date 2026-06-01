import { z } from "zod";
import { defineTool } from "./types.js";
import { compact } from "./helpers.js";

const TAG_COLORS = [
  "dark-pink", "dark-green", "dark-blue", "dark-red", "dark-teal", "dark-brown",
  "dark-orange", "dark-purple", "dark-warm-gray", "light-pink", "light-green",
  "light-blue", "light-red", "light-teal", "light-brown", "light-orange",
  "light-purple", "light-warm-gray", "none",
] as const;

export const createTag = defineTool({
  name: "create_tag",
  description: "Create a tag in a workspace.",
  schema: z.object({
    name: z.string(),
    workspace_id: z.string().optional().describe("defaults to the server's workspace"),
    color: z.enum(TAG_COLORS).optional(),
  }),
  handler: (client, input) => {
    const ws = input.workspace_id ?? client.defaultWorkspace;
    if (!ws) throw new Error("workspace_id required (no default workspace)");
    return client.request("POST", "/tags", compact({ name: input.name, workspace: ws, color: input.color }));
  },
});

export const deleteTag = defineTool({
  name: "delete_tag",
  description: "Delete a tag by gid.",
  schema: z.object({ tag_id: z.string() }),
  handler: async (client, input) => {
    await client.request("DELETE", `/tags/${input.tag_id}`);
    return { deleted: true, tag_id: input.tag_id };
  },
});

export const addTagToTask = defineTool({
  name: "add_tag_to_task",
  description: "Add a tag to a task.",
  schema: z.object({ task_id: z.string(), tag_id: z.string() }),
  handler: async (client, input) => {
    await client.request("POST", `/tasks/${input.task_id}/addTag`, { tag: input.tag_id });
    return { ok: true, task_id: input.task_id, tag_id: input.tag_id };
  },
});

export const removeTagFromTask = defineTool({
  name: "remove_tag_from_task",
  description: "Remove a tag from a task.",
  schema: z.object({ task_id: z.string(), tag_id: z.string() }),
  handler: async (client, input) => {
    await client.request("POST", `/tasks/${input.task_id}/removeTag`, { tag: input.tag_id });
    return { ok: true, task_id: input.task_id, tag_id: input.tag_id };
  },
});

export const getTasksForTag = defineTool({
  name: "get_tasks_for_tag",
  description: "List tasks that have a given tag.",
  schema: z.object({ tag_id: z.string() }),
  handler: (client, input) =>
    client.request("GET", `/tags/${input.tag_id}/tasks`, undefined, {
      opt_fields: "name,completed,due_on",
      limit: "100",
    }),
});

export const tagTools = [createTag, deleteTag, addTagToTask, removeTagFromTask, getTasksForTag];
