import { z } from "zod";
import { defineTool } from "./types.js";

export const createSection = defineTool({
  name: "create_section",
  description:
    "Create a new section in an existing project. Optionally position it relative to " +
    "another section with insert_before / insert_after (pass at most one).",
  schema: z.object({
    project_id: z.string().describe("gid of the project"),
    name: z.string().describe("name of the new section"),
    insert_before: z.string().optional().describe("gid of the section to insert before"),
    insert_after: z.string().optional().describe("gid of the section to insert after"),
  }),
  handler: (client, input) =>
    client.request("POST", `/projects/${input.project_id}/sections`, {
      name: input.name,
      ...(input.insert_before ? { insert_before: input.insert_before } : {}),
      ...(input.insert_after ? { insert_after: input.insert_after } : {}),
    }),
});

export const updateSection = defineTool({
  name: "update_section",
  description: "Rename a section.",
  schema: z.object({
    section_id: z.string().describe("gid of the section"),
    name: z.string().describe("new name for the section"),
  }),
  handler: (client, input) =>
    client.request("PUT", `/sections/${input.section_id}`, { name: input.name }),
});

export const deleteSection = defineTool({
  name: "delete_section",
  description:
    "Delete a section. Tasks in it are not deleted — they return to the project with no section. " +
    "Asana requires the section to be empty in some workspaces; move tasks out first if it errors.",
  schema: z.object({
    section_id: z.string().describe("gid of the section to delete"),
  }),
  handler: async (client, input) => {
    await client.request("DELETE", `/sections/${input.section_id}`);
    return { deleted: true, section_id: input.section_id };
  },
});

export const reorderSectionInProject = defineTool({
  name: "reorder_section_in_project",
  description:
    "Move a section to a new position in the project's display order. " +
    "Pass exactly one of before_section / after_section.",
  schema: z
    .object({
      project_id: z.string().describe("gid of the project"),
      section_id: z.string().describe("gid of the section to move"),
      before_section: z.string().optional().describe("gid of the section to place it before"),
      after_section: z.string().optional().describe("gid of the section to place it after"),
    })
    .refine((v) => !!v.before_section !== !!v.after_section, {
      message: "Provide exactly one of before_section or after_section",
    }),
  handler: (client, input) =>
    client.request("POST", `/projects/${input.project_id}/sections/insert`, {
      section: input.section_id,
      ...(input.before_section ? { before_section: input.before_section } : {}),
      ...(input.after_section ? { after_section: input.after_section } : {}),
    }),
});

export const reorderTaskInSection = defineTool({
  name: "reorder_task_in_section",
  description:
    "Move a task within a section to a new position. Adds the task to the section (idempotent) " +
    "and positions it relative to another task. Pass at most one of insert_before / insert_after; " +
    "with neither, the task goes to the top of the section.",
  schema: z
    .object({
      section_id: z.string().describe("gid of the section"),
      task_id: z.string().describe("gid of the task to move"),
      insert_before: z.string().optional().describe("gid of the task to place it before"),
      insert_after: z.string().optional().describe("gid of the task to place it after"),
    })
    .refine((v) => !(v.insert_before && v.insert_after), {
      message: "Provide at most one of insert_before or insert_after",
    }),
  handler: async (client, input) => {
    await client.request("POST", `/sections/${input.section_id}/addTask`, {
      task: input.task_id,
      ...(input.insert_before ? { insert_before: input.insert_before } : {}),
      ...(input.insert_after ? { insert_after: input.insert_after } : {}),
    });
    return { reordered: true, section_id: input.section_id, task_id: input.task_id };
  },
});

export const sectionTools = [
  createSection,
  updateSection,
  deleteSection,
  reorderSectionInProject,
  reorderTaskInSection,
];
