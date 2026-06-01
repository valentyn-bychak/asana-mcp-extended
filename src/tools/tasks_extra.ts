import { z } from "zod";
import { defineTool } from "./types.js";
import { compact } from "./helpers.js";

export const bulkCreateSubtasks = defineTool({
  name: "bulk_create_subtasks",
  description:
    "Create multiple subtasks under a parent task in one call. Each subtask can set name, notes, " +
    "assignee, due_on. Subtasks are created in order.",
  schema: z.object({
    parent_task_id: z.string(),
    subtasks: z
      .array(
        z.object({
          name: z.string(),
          notes: z.string().optional(),
          assignee: z.string().optional().describe("'me', email, or user gid"),
          due_on: z.string().optional().describe("YYYY-MM-DD"),
        }),
      )
      .min(1),
  }),
  handler: async (client, input) => {
    const created: { gid: string; name: string }[] = [];
    for (const s of input.subtasks) {
      const r = await client.request<any>(
        "POST",
        `/tasks/${input.parent_task_id}/subtasks`,
        compact({ name: s.name, notes: s.notes, assignee: s.assignee, due_on: s.due_on }),
      );
      created.push({ gid: r.gid, name: r.name });
    }
    return { parent_task_id: input.parent_task_id, created_count: created.length, subtasks: created };
  },
});

export const setTaskDependencies = defineTool({
  name: "set_task_dependencies",
  description:
    "Set a task's dependencies to exactly the given list (clears existing precedents first, then " +
    "adds the provided ones). Pass an empty array to clear all dependencies.",
  schema: z.object({
    task_id: z.string(),
    dependency_task_ids: z
      .array(z.string())
      .describe("task gids this task should depend on (be blocked by)"),
  }),
  handler: async (client, input) => {
    const existing = await client.request<any[]>(
      "GET",
      `/tasks/${input.task_id}/dependencies`,
      undefined,
      { opt_fields: "gid" },
    );
    if (existing.length) {
      await client.request("POST", `/tasks/${input.task_id}/removeDependencies`, {
        dependencies: existing.map((d) => d.gid),
      });
    }
    if (input.dependency_task_ids.length) {
      await client.request("POST", `/tasks/${input.task_id}/addDependencies`, {
        dependencies: input.dependency_task_ids,
      });
    }
    return { task_id: input.task_id, dependencies: input.dependency_task_ids };
  },
});

export const taskExtraTools = [bulkCreateSubtasks, setTaskDependencies];
