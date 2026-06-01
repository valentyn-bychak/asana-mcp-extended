import { z } from "zod";
import { defineTool } from "./types.js";
import { compact } from "./helpers.js";

export const listGoals = defineTool({
  name: "list_goals",
  description: "List goals in a workspace (optionally filtered by owner or time period).",
  schema: z.object({
    workspace_id: z.string().optional().describe("defaults to the server's workspace"),
    owner_id: z.string().optional().describe("filter to goals owned by this user gid"),
    time_period_id: z.string().optional(),
  }),
  handler: (client, input) => {
    const ws = input.workspace_id ?? client.defaultWorkspace;
    if (!ws) throw new Error("workspace_id required (no default workspace)");
    return client.request("GET", "/goals", undefined, {
      workspace: ws,
      owner: input.owner_id,
      time_periods: input.time_period_id,
      opt_fields: "name,owner.name,due_on,status,metric.current_number_value",
      limit: "100",
    });
  },
});

export const getGoal = defineTool({
  name: "get_goal",
  description: "Get a goal's details.",
  schema: z.object({ goal_id: z.string() }),
  handler: (client, input) =>
    client.request("GET", `/goals/${input.goal_id}`, undefined, {
      opt_fields: "name,notes,owner.name,due_on,start_on,status,metric,team.name,workspace.name",
    }),
});

export const createGoal = defineTool({
  name: "create_goal",
  description:
    "Create a goal in a workspace. Optionally set owner, time period, and due/start dates.",
  schema: z.object({
    name: z.string(),
    workspace_id: z.string().optional().describe("defaults to the server's workspace"),
    owner_id: z.string().optional().describe("user gid; defaults to none"),
    time_period_id: z.string().optional(),
    due_on: z.string().optional().describe("YYYY-MM-DD"),
    start_on: z.string().optional().describe("YYYY-MM-DD"),
    notes: z.string().optional(),
  }),
  handler: async (client, input) => {
    const ws = input.workspace_id ?? client.defaultWorkspace;
    if (!ws) throw new Error("workspace_id required (no default workspace)");

    // Asana requires a time period. Resolve the current one if not supplied.
    let timePeriod = input.time_period_id;
    if (!timePeriod) {
      const periods = await client.request<any[]>("GET", "/time_periods", undefined, {
        workspace: ws,
        opt_fields: "start_on,end_on,display_name",
        limit: "100",
      });
      const today = new Date().toISOString().slice(0, 10);
      const current = periods.find((p) => (!p.start_on || p.start_on <= today) && (!p.end_on || p.end_on >= today));
      timePeriod = (current ?? periods[0])?.gid;
      if (!timePeriod) {
        throw new Error("No time periods exist in this workspace; pass time_period_id explicitly");
      }
    }

    return client.request(
      "POST",
      "/goals",
      compact({
        name: input.name,
        workspace: ws,
        time_period: timePeriod,
        owner: input.owner_id,
        due_on: input.due_on,
        start_on: input.start_on,
        notes: input.notes,
      }),
    );
  },
});

export const updateGoal = defineTool({
  name: "update_goal",
  description: "Update a goal's fields (name, notes, owner, status, dates).",
  schema: z
    .object({
      goal_id: z.string(),
      name: z.string().optional(),
      notes: z.string().optional(),
      owner_id: z.string().optional(),
      status: z.enum(["green", "yellow", "red", "missed", "achieved", "partial", "dropped"]).optional(),
      due_on: z.string().optional(),
      start_on: z.string().optional(),
    })
    .refine((v) => Object.keys(v).length > 1, { message: "Provide at least one field to update" }),
  handler: (client, input) => {
    const { goal_id, owner_id, ...rest } = input;
    return client.request("PUT", `/goals/${goal_id}`, compact({ ...rest, owner: owner_id }));
  },
});

export const addSupportingRelationship = defineTool({
  name: "add_supporting_relationship",
  description:
    "Link a supporting resource (project, task, portfolio, or sub-goal) to a goal so it counts " +
    "toward that goal.",
  schema: z.object({
    goal_id: z.string(),
    supporting_resource_id: z.string().describe("gid of the project/task/portfolio/goal to link"),
  }),
  handler: (client, input) =>
    client.request("POST", `/goals/${input.goal_id}/addSupportingRelationship`, {
      supporting_resource: input.supporting_resource_id,
    }),
});

export const goalTools = [listGoals, getGoal, createGoal, updateGoal, addSupportingRelationship];
