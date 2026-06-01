#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AsanaClient, AsanaError } from "./client/asana.js";
import { tools, toolsByName } from "./registry.js";

const client = new AsanaClient({
  token: process.env.ASANA_PERSONAL_ACCESS_TOKEN ?? "",
  workspaceGid: process.env.ASANA_WORKSPACE_GID,
});

const server = new Server(
  { name: "asana-mcp-extended", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema, { target: "openApi3" }) as Record<string, unknown>,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolsByName.get(req.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
    };
  }

  const parsed = tool.schema.safeParse(req.params.arguments ?? {});
  if (!parsed.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Invalid arguments for ${tool.name}: ${parsed.error.issues
            .map((i: { path: (string | number)[]; message: string }) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ")}`,
        },
      ],
    };
  }

  try {
    const result = await tool.handler(client, parsed.data);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message =
      err instanceof AsanaError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the JSON-RPC channel.
  console.error(`asana-mcp-extended ready (${tools.length} tools)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
