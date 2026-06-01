import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const API_BASE = "https://app.asana.com/api/1.0";
const MAX_RETRIES = 3;
const DEBUG = process.env.DEBUG?.includes("asana-mcp") ?? false;

function debug(...args: unknown[]): void {
  // MCP servers speak JSON-RPC over stdout — logs MUST go to stderr.
  if (DEBUG) console.error("[asana-mcp]", ...args);
}

/** Error carrying the Asana-reported message(s) instead of a raw HTTP dump. */
export class AsanaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly phrase?: string,
  ) {
    super(message);
    this.name = "AsanaError";
  }
}

export interface AsanaClientOptions {
  token: string;
  /** Default workspace gid used when a tool needs one and the caller omits it. */
  workspaceGid?: string;
}

export class AsanaClient {
  private readonly token: string;
  readonly defaultWorkspace?: string;

  constructor(opts: AsanaClientOptions) {
    if (!opts.token) {
      throw new Error(
        "ASANA_PERSONAL_ACCESS_TOKEN is required. Generate one at https://app.asana.com/0/my-apps",
      );
    }
    this.token = opts.token;
    this.defaultWorkspace = opts.workspaceGid;
  }

  /** JSON request. Asana wraps request bodies in { data } and responses in { data }. */
  async request<T = any>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | undefined>,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify({ data: body }) } : {}),
    };
    return this.send<T>(url, init, `${method} ${path}`);
  }

  /**
   * Multipart upload (attachments). We let the runtime set the multipart
   * boundary by passing a FormData body — never set Content-Type manually.
   */
  async uploadAttachment(args: {
    parentTaskGid: string;
    filePath: string;
    fileName?: string;
    resourceSubtype?: string;
  }): Promise<any> {
    const bytes = await readFile(args.filePath);
    const name = args.fileName ?? basename(args.filePath);
    const form = new FormData();
    form.append("parent", args.parentTaskGid);
    if (args.resourceSubtype) form.append("resource_subtype", args.resourceSubtype);
    // Blob from the file bytes; the third arg sets the filename in the part.
    form.append("file", new Blob([bytes]), name);

    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
      body: form,
    };
    return this.send<any>(`${API_BASE}/attachments`, init, "POST /attachments");
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(API_BASE + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  private async send<T>(url: string, init: RequestInit, label: string): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt++;
      debug(label, `(attempt ${attempt})`);
      const res = await fetch(url, init);

      if (res.status === 429 && attempt <= MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 2 ** attempt;
        debug(`429 rate limited; retry in ${retryAfter}s`);
        await delay(retryAfter * 1000);
        continue;
      }

      const text = await res.text();
      const payload = text ? safeJson(text) : undefined;

      if (!res.ok) {
        const messages = payload?.errors?.map((e: any) => e.message).filter(Boolean);
        const msg =
          messages && messages.length
            ? messages.join("; ")
            : `${res.status} ${res.statusText}`;
        throw new AsanaError(`Asana API error (${label}): ${msg}`, res.status, res.statusText);
      }

      return (payload?.data ?? payload) as T;
    }
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
