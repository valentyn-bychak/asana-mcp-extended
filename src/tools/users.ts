import { z } from "zod";
import { defineTool } from "./types.js";

async function fetchAssigneeTasks(
  client: any,
  userId: string,
  workspaceId: string | undefined,
) {
  const ws = workspaceId ?? client.defaultWorkspace;
  if (!ws) throw new Error("workspace_id required (no default workspace)");
  // completed_since=now returns incomplete tasks (plus those completed at/after now).
  return client.request("GET", "/tasks", undefined, {
    assignee: userId,
    workspace: ws,
    completed_since: "now",
    opt_fields: "name,due_on,completed,projects.name",
    limit: "100",
  }) as Promise<any[]>;
}

export const getTasksForUser = defineTool({
  name: "get_tasks_for_user",
  description:
    "List a user's incomplete assigned tasks in a workspace. Pass 'me' or a user gid. " +
    "Useful for building someone's weekly plan or workload view.",
  schema: z.object({
    user_id: z.string().describe("'me' or a user gid"),
    workspace_id: z.string().optional().describe("defaults to the server's workspace"),
  }),
  handler: (client, input) => fetchAssigneeTasks(client, input.user_id, input.workspace_id),
});

export const overdueTasksForUser = defineTool({
  name: "overdue_tasks_for_user",
  description:
    "List a user's overdue (past-due, incomplete) tasks — due date strictly before today.",
  schema: z.object({
    user_id: z.string().describe("'me' or a user gid"),
    workspace_id: z.string().optional().describe("defaults to the server's workspace"),
  }),
  handler: async (client, input) => {
    const tasks = await fetchAssigneeTasks(client, input.user_id, input.workspace_id);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = tasks
      .filter((t) => !t.completed && t.due_on && t.due_on < today)
      .map((t) => ({ gid: t.gid, name: t.name, due_on: t.due_on, projects: (t.projects ?? []).map((p: any) => p.name) }));
    return { user_id: input.user_id, today, overdue_count: overdue.length, tasks: overdue };
  },
});

export const userTools = [getTasksForUser, overdueTasksForUser];
