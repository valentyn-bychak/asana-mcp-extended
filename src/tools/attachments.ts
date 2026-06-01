import { z } from "zod";
import { defineTool } from "./types.js";

export const addAttachment = defineTool({
  name: "add_attachment",
  description:
    "Upload a local file (mp4/pdf/png/doc/etc.) as an attachment to an Asana task. " +
    "Reads the file from disk at the given absolute path. Returns the new attachment gid.",
  schema: z.object({
    task_id: z.string().describe("gid of the task to attach the file to"),
    file_path: z.string().describe("absolute path to the file on disk"),
    file_name: z.string().optional().describe("override the attachment's display name"),
    resource_subtype: z
      .enum(["asana", "external", "gdrive", "onedrive", "dropbox", "box", "vimeo"])
      .optional()
      .describe("attachment source type; defaults to 'asana' (host the file in Asana)"),
  }),
  handler: (client, input) =>
    client.uploadAttachment({
      parentTaskGid: input.task_id,
      filePath: input.file_path,
      fileName: input.file_name,
      resourceSubtype: input.resource_subtype,
    }),
});

export const deleteAttachment = defineTool({
  name: "delete_attachment",
  description: "Delete an attachment by its gid.",
  schema: z.object({
    attachment_id: z.string().describe("gid of the attachment to delete"),
  }),
  handler: async (client, input) => {
    await client.request("DELETE", `/attachments/${input.attachment_id}`);
    return { deleted: true, attachment_id: input.attachment_id };
  },
});

export const attachmentTools = [addAttachment, deleteAttachment];
