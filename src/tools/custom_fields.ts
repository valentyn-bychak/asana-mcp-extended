import { z } from "zod";
import { defineTool } from "./types.js";

// Many workspaces track Estimated/Actual time as plain number custom fields
// rather than Asana's native time tracking. Newly created projects don't carry
// those fields automatically — these tools discover and attach them so the
// columns show up in the UI and can be set via the task custom_fields API.

export const listWorkspaceCustomFields = defineTool({
  name: "list_workspace_custom_fields",
  description:
    "List all custom fields defined in a workspace (gid, name, type). Use this to find the " +
    "gid of fields like 'Estimated time' before attaching them to a project. " +
    "Falls back to the server's default workspace when workspace_id is omitted.",
  schema: z.object({
    workspace_id: z
      .string()
      .optional()
      .describe("workspace gid; defaults to the server's configured workspace"),
    name_contains: z
      .string()
      .optional()
      .describe("case-insensitive filter on the field name"),
  }),
  handler: async (client, input) => {
    const ws = input.workspace_id ?? client.defaultWorkspace;
    if (!ws) throw new Error("workspace_id is required (no default workspace configured)");
    const fields = await client.request<any[]>(
      "GET",
      `/workspaces/${ws}/custom_fields`,
      undefined,
      { opt_fields: "name,resource_subtype,type", limit: "100" },
    );
    const filtered = input.name_contains
      ? fields.filter((f) =>
          f.name?.toLowerCase().includes(input.name_contains!.toLowerCase()),
        )
      : fields;
    return filtered.map((f) => ({ gid: f.gid, name: f.name, type: f.type }));
  },
});

export const addCustomFieldToProject = defineTool({
  name: "add_custom_field_to_project",
  description:
    "Attach an existing workspace custom field to a project so its column appears in the UI " +
    "and values can be set on the project's tasks. Use for adding e.g. 'Estimated time' to a " +
    "freshly created project. NOTE: this works for custom fields only — Asana's NATIVE time-" +
    "tracking 'Actual time' field cannot be attached via the API (Asana limitation); add it in " +
    "the project's Customize menu in the UI. Actual-time values written via add_time_tracking_" +
    "entry are still stored and will appear once that column is added.",
  schema: z.object({
    project_id: z.string().describe("gid of the project"),
    custom_field_id: z.string().describe("gid of the workspace custom field to attach"),
    is_important: z
      .boolean()
      .optional()
      .describe("show the field prominently on tasks (adds it to the task header). Default true."),
  }),
  handler: (client, input) =>
    client.request("POST", `/projects/${input.project_id}/addCustomFieldSetting`, {
      custom_field: input.custom_field_id,
      is_important: input.is_important ?? true,
    }),
});

export const removeCustomFieldFromProject = defineTool({
  name: "remove_custom_field_from_project",
  description: "Detach a custom field from a project (does not delete the field or its values).",
  schema: z.object({
    project_id: z.string().describe("gid of the project"),
    custom_field_id: z.string().describe("gid of the custom field to detach"),
  }),
  handler: async (client, input) => {
    await client.request("POST", `/projects/${input.project_id}/removeCustomFieldSetting`, {
      custom_field: input.custom_field_id,
    });
    return {
      removed: true,
      project_id: input.project_id,
      custom_field_id: input.custom_field_id,
    };
  },
});

export const customFieldTools = [
  listWorkspaceCustomFields,
  addCustomFieldToProject,
  removeCustomFieldFromProject,
];
