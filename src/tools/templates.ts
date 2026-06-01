import { z } from "zod";
import { defineTool } from "./types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const listProjectTemplates = defineTool({
  name: "list_project_templates",
  description:
    "List available project templates (gid, name, team). Pass team_id to scope to one team; " +
    "otherwise lists templates across all teams the current user belongs to in the workspace.",
  schema: z.object({
    team_id: z.string().optional().describe("team gid to list templates for"),
    workspace_id: z
      .string()
      .optional()
      .describe("workspace gid; defaults to the server's configured workspace"),
  }),
  handler: async (client, input) => {
    const teams: { gid: string; name?: string }[] = [];
    if (input.team_id) {
      teams.push({ gid: input.team_id });
    } else {
      const ws = input.workspace_id ?? client.defaultWorkspace;
      if (!ws) throw new Error("Provide team_id or configure a default workspace");
      const myTeams = await client.request<any[]>(
        "GET",
        "/users/me/teams",
        undefined,
        { organization: ws, opt_fields: "name" },
      );
      teams.push(...myTeams.map((t) => ({ gid: t.gid, name: t.name })));
    }

    const out: { gid: string; name: string; team: string }[] = [];
    for (const team of teams) {
      const tpls = await client.request<any[]>(
        "GET",
        `/teams/${team.gid}/project_templates`,
        undefined,
        { opt_fields: "name", limit: "100" },
      );
      out.push(
        ...tpls.map((t) => ({ gid: t.gid, name: t.name, team: team.name ?? team.gid })),
      );
    }
    return out;
  },
});

export const getProjectTemplate = defineTool({
  name: "get_project_template",
  description:
    "Get a project template's details: name, description, team, color, whether it is public, " +
    "and any requested_dates / requested_roles that must be supplied when instantiating.",
  schema: z.object({
    template_id: z.string().describe("gid of the project template"),
  }),
  handler: (client, input) =>
    client.request(
      "GET",
      `/project_templates/${input.template_id}`,
      undefined,
      {
        opt_fields:
          "name,description,public,color,team.name,requested_dates.gid,requested_dates.name,requested_dates.description,requested_roles.gid,requested_roles.name",
      },
    ),
});

export const createProjectFromTemplate = defineTool({
  name: "create_project_from_template",
  description:
    "Create a new project from a project template (instantiateProject). Inherits the template's " +
    "sections, tasks, custom fields AND native settings like Time tracking / Actual time — the " +
    "recommended way to get the native time-tracking column on a new project (it cannot be added " +
    "via the API directly). If the template defines requested_dates (check with get_project_" +
    "template), pass them in requested_dates.",
  schema: z.object({
    template_id: z.string().describe("gid of the project template"),
    name: z.string().describe("name for the new project"),
    team_id: z
      .string()
      .optional()
      .describe("team gid for the new project; defaults to the template's team"),
    public: z
      .boolean()
      .optional()
      .describe("whether the project is public to the team/workspace (default false)"),
    requested_dates: z
      .array(
        z.object({
          gid: z.string().describe("gid of the requested date variable from the template"),
          value: z.string().describe("date value, YYYY-MM-DD"),
        }),
      )
      .optional()
      .describe("date values for templates that request them"),
  }),
  handler: async (client, input) => {
    // Resolve team: instantiate needs a team (or public=true). Default to the template's team.
    let team = input.team_id;
    if (!team) {
      const tpl = await client.request<any>(
        "GET",
        `/project_templates/${input.template_id}`,
        undefined,
        { opt_fields: "team.gid" },
      );
      team = tpl?.team?.gid;
    }

    const body: Record<string, unknown> = {
      name: input.name,
      public: input.public ?? false,
    };
    if (team) body.team = team;
    if (input.requested_dates?.length) {
      body.requested_dates = input.requested_dates.map((d) => ({
        gid: d.gid,
        value: d.value,
      }));
    }

    const job = await client.request<any>(
      "POST",
      `/project_templates/${input.template_id}/instantiateProject`,
      body,
    );

    // The new project gid is usually present immediately; poll the job briefly otherwise.
    let projectGid: string | undefined = job?.new_project?.gid;
    let status: string | undefined = job?.status;
    for (let i = 0; i < 8 && !projectGid; i++) {
      await delay(700);
      const j = await client.request<any>(
        "GET",
        `/jobs/${job.gid}`,
        undefined,
        { opt_fields: "status,new_project.gid,new_project.name" },
      );
      status = j?.status;
      projectGid = j?.new_project?.gid;
      if (status === "succeeded" || status === "failed") break;
    }

    if (!projectGid) {
      throw new Error(
        `Project instantiation did not return a project (job ${job?.gid}, status ${status ?? "unknown"})`,
      );
    }

    const project = await client.request<any>(
      "GET",
      `/projects/${projectGid}`,
      undefined,
      { opt_fields: "name,permalink_url" },
    );
    return {
      project_gid: projectGid,
      name: project?.name ?? input.name,
      permalink_url: project?.permalink_url,
      job_gid: job?.gid,
      job_status: status,
    };
  },
});

export const templateTools = [
  listProjectTemplates,
  getProjectTemplate,
  createProjectFromTemplate,
];
