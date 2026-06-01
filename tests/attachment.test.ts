import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the file read so we don't touch the real filesystem.
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("fake-bytes")),
}));

import { AsanaClient } from "../src/client/asana.js";
import { toolsByName } from "../src/registry.js";

afterEach(() => vi.unstubAllGlobals());

describe("add_attachment", () => {
  it("uploads multipart form-data with parent + file, no manual Content-Type", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, init };
        return new Response(JSON.stringify({ data: { gid: "att1" } }), { status: 200 });
      }),
    );

    const client = new AsanaClient({ token: "tok" });
    const out = await toolsByName.get("add_attachment")!.handler(client, {
      task_id: "TASK",
      file_path: "/tmp/IMG_4776.MOV",
      resource_subtype: "asana",
    });

    expect(out).toEqual({ gid: "att1" });
    expect(captured!.url).toBe("https://app.asana.com/api/1.0/attachments");
    expect(captured!.init.method).toBe("POST");

    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    // Must NOT set Content-Type — the runtime adds the multipart boundary.
    expect(headers["Content-Type"]).toBeUndefined();

    const body = captured!.init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("parent")).toBe("TASK");
    expect(body.get("resource_subtype")).toBe("asana");
    const file = body.get("file");
    expect(file).toBeInstanceOf(Blob);
  });

  it("defaults the file name to the basename of the path", async () => {
    let body: FormData | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        body = init.body as FormData;
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      }),
    );
    const client = new AsanaClient({ token: "tok" });
    await toolsByName.get("add_attachment")!.handler(client, {
      task_id: "T",
      file_path: "/a/b/report.pdf",
    });
    const file = body!.get("file") as File;
    // When a filename is given to FormData.append, it surfaces as File.name.
    expect((file as File).name).toBe("report.pdf");
  });
});
