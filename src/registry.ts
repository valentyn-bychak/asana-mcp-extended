import type { ToolDef } from "./tools/types.js";
import { attachmentTools } from "./tools/attachments.js";
import { sectionTools } from "./tools/sections.js";
import { projectTools } from "./tools/projects.js";
import { timeTrackingTools } from "./tools/time_tracking.js";
import { customFieldTools } from "./tools/custom_fields.js";

/** All tools exposed by the server (P0 + custom-field management). */
export const tools: ToolDef<any>[] = [
  ...attachmentTools,
  ...sectionTools,
  ...projectTools,
  ...timeTrackingTools,
  ...customFieldTools,
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
