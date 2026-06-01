import { z } from "zod";
import { defineTool } from "./types.js";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export const setTaskRecurrence = defineTool({
  name: "set_task_recurrence",
  description:
    "Make a task recurring. A recurring task needs a due date — pass due_on to set/anchor it. " +
    "For a simple cadence use freq + interval (e.g. freq=DAILY interval=1 = every day; " +
    "freq=WEEKLY interval=2 = every two weeks). To repeat on specific weekdays, pass weekdays " +
    "(e.g. ['MON','WED','FRI']) — freq/interval are then ignored.",
  schema: z
    .object({
      task_id: z.string().describe("gid of the task"),
      freq: z
        .enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
        .optional()
        .describe("repeat frequency; required unless weekdays is given"),
      interval: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("repeat every N periods (default 1)"),
      weekdays: z
        .array(z.enum(WEEKDAYS))
        .optional()
        .describe("specific weekdays to repeat on (uses Asana's 'weekly' recurrence type)"),
      due_on: z.string().optional().describe("YYYY-MM-DD; the task's due date to anchor recurrence"),
    })
    .refine((v) => !!v.freq || (v.weekdays && v.weekdays.length > 0), {
      message: "Provide freq (and optional interval) or a non-empty weekdays list",
    }),
  handler: (client, input) => {
    const recurrence =
      input.weekdays && input.weekdays.length
        ? { type: "weekly", data: JSON.stringify({ weekday: input.weekdays }) }
        : {
            type: "periodically",
            data: JSON.stringify({ freq: input.freq, interval: input.interval ?? 1 }),
          };
    const data: Record<string, unknown> = { recurrence };
    if (input.due_on) data.due_on = input.due_on;
    return client.request("PUT", `/tasks/${input.task_id}`, data, {
      opt_fields: "name,due_on,recurrence",
    });
  },
});

export const recurrenceTools = [setTaskRecurrence];
