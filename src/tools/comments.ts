import { z } from "zod";
import { defineTool } from "./types.js";

export const getComments = defineTool({
  name: "get_comments",
  description:
    "List comment stories on a task (newest fields included). Filters out system/audit stories, " +
    "returning only user comments.",
  schema: z.object({
    task_id: z.string(),
    include_system: z
      .boolean()
      .optional()
      .describe("also include non-comment system stories (default false)"),
  }),
  handler: async (client, input) => {
    const stories = await client.request<any[]>(
      "GET",
      `/tasks/${input.task_id}/stories`,
      undefined,
      { opt_fields: "text,resource_subtype,created_at,created_by.name", limit: "100" },
    );
    const rows = input.include_system
      ? stories
      : stories.filter((s) => s.resource_subtype === "comment_added");
    return rows.map((s) => ({
      gid: s.gid,
      text: s.text,
      created_by: s.created_by?.name,
      created_at: s.created_at,
      resource_subtype: s.resource_subtype,
    }));
  },
});

export const updateComment = defineTool({
  name: "update_comment",
  description:
    "Edit a comment's text. Only comment stories you authored can be edited.",
  schema: z.object({
    comment_id: z.string().describe("gid of the story/comment"),
    text: z.string(),
  }),
  handler: (client, input) =>
    client.request("PUT", `/stories/${input.comment_id}`, { text: input.text }),
});

export const deleteComment = defineTool({
  name: "delete_comment",
  description: "Delete a comment story (only ones you authored).",
  schema: z.object({ comment_id: z.string() }),
  handler: async (client, input) => {
    await client.request("DELETE", `/stories/${input.comment_id}`);
    return { deleted: true, comment_id: input.comment_id };
  },
});

export const commentTools = [getComments, updateComment, deleteComment];
