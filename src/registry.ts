import type { ToolDef } from "./tools/types.js";
import { attachmentTools } from "./tools/attachments.js";
import { sectionTools } from "./tools/sections.js";
import { projectTools } from "./tools/projects.js";
import { timeTrackingTools } from "./tools/time_tracking.js";
import { customFieldTools } from "./tools/custom_fields.js";
import { templateTools } from "./tools/templates.js";
import { recurrenceTools } from "./tools/recurrence.js";
import { tagTools } from "./tools/tags.js";
import { commentTools } from "./tools/comments.js";
import { portfolioTools } from "./tools/portfolios.js";
import { taskExtraTools } from "./tools/tasks_extra.js";
import { projectExtraTools } from "./tools/project_extras.js";
import { taskTemplateTools } from "./tools/task_templates.js";
import { goalTools } from "./tools/goals.js";
import { userTools } from "./tools/users.js";
import { reportTools } from "./tools/reports.js";
import { myTasksTools } from "./tools/my_tasks.js";
import { coreReadTools } from "./tools/core_read.js";
import { coreWriteTools } from "./tools/core_write.js";

/** All tools exposed by the server. */
export const tools: ToolDef<any>[] = [
  ...attachmentTools,
  ...sectionTools,
  ...projectTools,
  ...timeTrackingTools,
  ...customFieldTools,
  ...templateTools,
  ...recurrenceTools,
  ...tagTools,
  ...commentTools,
  ...portfolioTools,
  ...taskExtraTools,
  ...projectExtraTools,
  ...taskTemplateTools,
  ...goalTools,
  ...userTools,
  ...reportTools,
  ...myTasksTools,
  ...coreReadTools,
  ...coreWriteTools,
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
