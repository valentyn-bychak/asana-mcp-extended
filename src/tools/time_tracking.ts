import { z } from "zod";
import { defineTool } from "./types.js";

// Asana stores time tracking durations in minutes (duration_minutes).
// Requires an Advanced (or higher) Asana plan.

export const addTimeTrackingEntry = defineTool({
  name: "add_time_tracking_entry",
  description:
    "Add an actual-time entry to a task. duration_minutes is the logged time in minutes. " +
    "Requires an Asana Advanced+ plan. Defaults entered_on to today if omitted.",
  schema: z.object({
    task_id: z.string().describe("gid of the task"),
    duration_minutes: z.number().int().positive().describe("logged time in minutes"),
    entered_on: z.string().optional().describe("YYYY-MM-DD; defaults to today"),
  }),
  handler: (client, input) =>
    client.request("POST", `/tasks/${input.task_id}/time_tracking_entries`, {
      duration_minutes: input.duration_minutes,
      ...(input.entered_on ? { entered_on: input.entered_on } : {}),
    }),
});

export const getTimeTrackingEntries = defineTool({
  name: "get_time_tracking_entries",
  description: "List all time tracking entries for a task.",
  schema: z.object({
    task_id: z.string().describe("gid of the task"),
  }),
  handler: (client, input) =>
    client.request(
      "GET",
      `/tasks/${input.task_id}/time_tracking_entries`,
      undefined,
      { opt_fields: "duration_minutes,entered_on,created_by.name,created_at" },
    ),
});

export const updateTimeTrackingEntry = defineTool({
  name: "update_time_tracking_entry",
  description: "Update an existing time tracking entry's duration and/or date.",
  schema: z
    .object({
      entry_id: z.string().describe("gid of the time tracking entry"),
      duration_minutes: z.number().int().positive().optional(),
      entered_on: z.string().optional().describe("YYYY-MM-DD"),
    })
    .refine((v) => v.duration_minutes !== undefined || v.entered_on !== undefined, {
      message: "Provide at least one of duration_minutes or entered_on",
    }),
  handler: (client, input) => {
    const { entry_id, ...fields } = input;
    const data = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    return client.request("PUT", `/time_tracking_entries/${entry_id}`, data);
  },
});

export const deleteTimeTrackingEntry = defineTool({
  name: "delete_time_tracking_entry",
  description: "Delete a time tracking entry by its gid.",
  schema: z.object({
    entry_id: z.string().describe("gid of the time tracking entry"),
  }),
  handler: async (client, input) => {
    await client.request("DELETE", `/time_tracking_entries/${input.entry_id}`);
    return { deleted: true, entry_id: input.entry_id };
  },
});

export const timeTrackingTools = [
  addTimeTrackingEntry,
  getTimeTrackingEntries,
  updateTimeTrackingEntry,
  deleteTimeTrackingEntry,
];
