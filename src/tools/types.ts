import type { z } from "zod";
import type { AsanaClient } from "../client/asana.js";

/** A single MCP tool: name, human description, zod input schema, and handler. */
export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  handler: (client: AsanaClient, input: z.infer<S>) => Promise<unknown>;
}

/** Helper to define a tool with full type inference on the handler input. */
export function defineTool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef<S> {
  return def;
}
