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

export const createCustomField = defineTool({
  name: "create_custom_field",
  description:
    "Create a new custom field in a workspace. For enum/multi_enum pass enum_options. For number " +
    "pass precision (decimal places). The field is created in the workspace's library; attach it " +
    "to a project with add_custom_field_to_project.",
  schema: z.object({
    name: z.string(),
    resource_subtype: z.enum(["text", "number", "enum", "multi_enum", "date", "people"]),
    workspace_id: z.string().optional().describe("defaults to the server's workspace"),
    precision: z.number().int().min(0).max(6).optional().describe("decimals for number fields (e.g. 0)"),
    enum_options: z
      .array(z.object({ name: z.string(), color: z.string().optional() }))
      .optional()
      .describe("options for enum/multi_enum fields"),
  }),
  handler: (client, input) => {
    const ws = input.workspace_id ?? client.defaultWorkspace;
    if (!ws) throw new Error("workspace_id required (no default workspace)");
    return client.request(
      "POST",
      "/custom_fields",
      compactCF({
        workspace: ws,
        name: input.name,
        resource_subtype: input.resource_subtype,
        type: input.resource_subtype,
        precision: input.resource_subtype === "number" ? input.precision ?? 0 : undefined,
        enum_options: input.enum_options,
      }),
    );
  },
});

export const deleteCustomField = defineTool({
  name: "delete_custom_field",
  description:
    "Delete a custom field from the workspace entirely (removes it and its values from ALL " +
    "projects/tasks). Irreversible — use with care.",
  schema: z.object({ custom_field_id: z.string() }),
  handler: async (client, input) => {
    await client.request("DELETE", `/custom_fields/${input.custom_field_id}`);
    return { deleted: true, custom_field_id: input.custom_field_id };
  },
});

export const addEnumOption = defineTool({
  name: "add_enum_option",
  description: "Add a new option to an existing enum/multi_enum custom field.",
  schema: z.object({
    custom_field_id: z.string(),
    name: z.string(),
    color: z.string().optional(),
    insert_before: z.string().optional().describe("gid of the option to insert before"),
    insert_after: z.string().optional().describe("gid of the option to insert after"),
  }),
  handler: (client, input) =>
    client.request(
      "POST",
      `/custom_fields/${input.custom_field_id}/enum_options`,
      compactCF({
        name: input.name,
        color: input.color,
        insert_before: input.insert_before,
        insert_after: input.insert_after,
      }),
    ),
});

function compactCF(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export const customFieldTools = [
  listWorkspaceCustomFields,
  addCustomFieldToProject,
  removeCustomFieldFromProject,
  createCustomField,
  deleteCustomField,
  addEnumOption,
];
