import { z } from "zod";
import { defineTool } from "./types.js";
import type { AsanaClient } from "../client/asana.js";

async function userTaskListGid(client: AsanaClient, userId: string): Promise<string> {
  const ws = client.defaultWorkspace;
  if (!ws) throw new Error("No default workspace configured");
  const utl = await client.request<any>(
    "GET",
    `/users/${userId}/user_task_list`,
    undefined,
    { workspace: ws, opt_fields: "gid" },
  );
  if (!utl?.gid) throw new Error("Could not resolve the user's My Tasks list");
  return utl.gid;
}

export const getMyTasksSections = defineTool({
  name: "get_my_tasks_sections",
  description:
    "List the sections of a user's My Tasks list (gid + name). Use the gids with " +
    "move_to_my_tasks_section. Pass 'me' or a user gid.",
  schema: z.object({
    user_id: z.string().default("me").describe("'me' or a user gid"),
  }),
  handler: async (client, input) => {
    const utl = await userTaskListGid(client, input.user_id ?? "me");
    // A user task list behaves like a project for section listing.
    const sections = await client.request<any[]>(
      "GET",
      `/projects/${utl}/sections`,
      undefined,
      { opt_fields: "name" },
    );
    return sections.map((s) => ({ gid: s.gid, name: s.name }));
  },
});

export const moveToMyTasksSection = defineTool({
  name: "move_to_my_tasks_section",
  description:
    "Move a task into a specific section of its assignee's My Tasks list (e.g. 'Регулярні задачі'). " +
    "Get section gids from get_my_tasks_sections. Optionally (re)assign the task with assignee.",
  schema: z.object({
    task_id: z.string(),
    my_tasks_section_id: z.string().describe("gid of a My Tasks section"),
    assignee: z.string().optional().describe("'me' or user gid to assign the task to first"),
  }),
  handler: async (client, input) => {
    if (input.assignee) {
      await client.request("PUT", `/tasks/${input.task_id}`, { assignee: input.assignee });
    }
    await client.request("PUT", `/tasks/${input.task_id}`, {
      assignee_section: input.my_tasks_section_id,
    });
    return { ok: true, task_id: input.task_id, my_tasks_section_id: input.my_tasks_section_id };
  },
});

export const myTasksTools = [getMyTasksSections, moveToMyTasksSection];
