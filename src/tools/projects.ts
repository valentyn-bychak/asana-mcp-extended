import { z } from "zod";
import { defineTool } from "./types.js";

const ASANA_COLORS = [
  "dark-pink", "dark-green", "dark-blue", "dark-red", "dark-teal",
  "dark-brown", "dark-orange", "dark-purple", "dark-warm-gray",
  "light-pink", "light-green", "light-blue", "light-red", "light-teal",
  "light-brown", "light-orange", "light-purple", "light-warm-gray", "none",
] as const;

export const updateProject = defineTool({
  name: "update_project",
  description:
    "Update settings of an existing project. All fields optional — only provided fields change. " +
    "Use notes for plain text or html_notes for rich text (not both).",
  schema: z
    .object({
      project_id: z.string().describe("gid of the project"),
      name: z.string().optional(),
      notes: z.string().optional().describe("plain-text description"),
      html_notes: z.string().optional().describe("rich-text description (HTML subset)"),
      archived: z.boolean().optional(),
      color: z.enum(ASANA_COLORS).optional(),
      default_view: z
        .enum(["list", "board", "calendar", "timeline", "gantt"])
        .optional(),
      privacy_setting: z
        .enum(["public_to_workspace", "private_to_team", "private"])
        .optional(),
      due_on: z.string().optional().describe("YYYY-MM-DD"),
      start_on: z.string().optional().describe("YYYY-MM-DD"),
      owner: z.string().optional().describe("gid of the new owner user"),
    })
    .refine((v) => !(v.notes && v.html_notes), {
      message: "Provide either notes or html_notes, not both",
    }),
  handler: (client, input) => {
    const { project_id, ...fields } = input;
    const data = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    return client.request("PUT", `/projects/${project_id}`, data);
  },
});

export const archiveProject = defineTool({
  name: "archive_project",
  description: "Archive a project (convenience wrapper over update_project).",
  schema: z.object({ project_id: z.string() }),
  handler: (client, input) =>
    client.request("PUT", `/projects/${input.project_id}`, { archived: true }),
});

export const unarchiveProject = defineTool({
  name: "unarchive_project",
  description: "Unarchive a project (convenience wrapper over update_project).",
  schema: z.object({ project_id: z.string() }),
  handler: (client, input) =>
    client.request("PUT", `/projects/${input.project_id}`, { archived: false }),
});

export const addProjectMember = defineTool({
  name: "add_project_member",
  description: "Add one or more members (users) to a project.",
  schema: z.object({
    project_id: z.string(),
    user_ids: z
      .array(z.string())
      .min(1)
      .describe("gids (or 'me') of users to add as members"),
  }),
  handler: (client, input) =>
    client.request("POST", `/projects/${input.project_id}/addMembers`, {
      members: input.user_ids.join(","),
    }),
});

export const removeProjectMember = defineTool({
  name: "remove_project_member",
  description:
    "Remove one or more members (users) from a project. WARNING: removing yourself " +
    "(the current token's user) revokes your own access to the project — you will no " +
    "longer be able to read or modify it.",
  schema: z.object({
    project_id: z.string(),
    user_ids: z.array(z.string()).min(1).describe("gids of users to remove"),
  }),
  handler: (client, input) =>
    client.request("POST", `/projects/${input.project_id}/removeMembers`, {
      members: input.user_ids.join(","),
    }),
});

export const projectTools = [
  updateProject,
  archiveProject,
  unarchiveProject,
  addProjectMember,
  removeProjectMember,
];
