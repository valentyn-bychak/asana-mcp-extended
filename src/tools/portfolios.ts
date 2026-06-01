import { z } from "zod";
import { defineTool } from "./types.js";
import { compact } from "./helpers.js";

const COLORS = [
  "dark-pink", "dark-green", "dark-blue", "dark-red", "dark-teal", "dark-brown",
  "dark-orange", "dark-purple", "dark-warm-gray", "light-pink", "light-green",
  "light-blue", "light-red", "light-teal", "light-brown", "light-orange",
  "light-purple", "light-warm-gray", "none",
] as const;

export const createPortfolio = defineTool({
  name: "create_portfolio",
  description: "Create a portfolio in a workspace.",
  schema: z.object({
    name: z.string(),
    workspace_id: z.string().optional().describe("defaults to the server's workspace"),
    color: z.enum(COLORS).optional(),
  }),
  handler: (client, input) => {
    const ws = input.workspace_id ?? client.defaultWorkspace;
    if (!ws) throw new Error("workspace_id required (no default workspace)");
    return client.request("POST", "/portfolios", compact({ name: input.name, workspace: ws, color: input.color }));
  },
});

export const addPortfolioItem = defineTool({
  name: "add_portfolio_item",
  description: "Add a project (or portfolio) to a portfolio.",
  schema: z.object({
    portfolio_id: z.string(),
    item_id: z.string().describe("gid of the project/portfolio to add"),
  }),
  handler: async (client, input) => {
    await client.request("POST", `/portfolios/${input.portfolio_id}/addItem`, { item: input.item_id });
    return { ok: true, portfolio_id: input.portfolio_id, item_id: input.item_id };
  },
});

export const removePortfolioItem = defineTool({
  name: "remove_portfolio_item",
  description: "Remove an item from a portfolio.",
  schema: z.object({ portfolio_id: z.string(), item_id: z.string() }),
  handler: async (client, input) => {
    await client.request("POST", `/portfolios/${input.portfolio_id}/removeItem`, { item: input.item_id });
    return { ok: true, portfolio_id: input.portfolio_id, item_id: input.item_id };
  },
});

export const portfolioTools = [createPortfolio, addPortfolioItem, removePortfolioItem];
