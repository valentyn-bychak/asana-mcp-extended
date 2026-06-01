import type { ToolDef } from "./tools/types.js";
import { attachmentTools } from "./tools/attachments.js";
import { sectionTools } from "./tools/sections.js";
import { projectTools } from "./tools/projects.js";
import { timeTrackingTools } from "./tools/time_tracking.js";

/** All P0 tools exposed by the server. */
export const tools: ToolDef<any>[] = [
  ...attachmentTools,
  ...sectionTools,
  ...projectTools,
  ...timeTrackingTools,
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
