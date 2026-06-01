import { z } from "zod";
import { defineTool } from "./types.js";
import { resolveJobResource } from "./helpers.js";

export const listTaskTemplates = defineTool({
  name: "list_task_templates",
  description: "List task templates available in a project.",
  schema: z.object({
    project_id: z.string().describe("gid of the project whose task templates to list"),
  }),
  handler: (client, input) =>
    client.request("GET", "/task_templates", undefined, {
      project: input.project_id,
      opt_fields: "name",
      limit: "100",
    }),
});

export const instantiateTaskTemplate = defineTool({
  name: "instantiate_task_template",
  description: "Create a task from a task template. Returns the new task gid.",
  schema: z.object({
    task_template_id: z.string(),
    name: z.string().optional().describe("override the new task's name"),
  }),
  handler: async (client, input) => {
    const body = input.name ? { name: input.name } : {};
    const job = await client.request<any>(
      "POST",
      `/task_templates/${input.task_template_id}/instantiateTask`,
      body,
    );
    const { gid, status } = await resolveJobResource(client, job, "new_task");
    const task = await client.request<any>("GET", `/tasks/${gid}`, undefined, {
      opt_fields: "name,permalink_url",
    });
    return { task_gid: gid, name: task?.name, permalink_url: task?.permalink_url, job_status: status };
  },
});

export const taskTemplateTools = [listTaskTemplates, instantiateTaskTemplate];
