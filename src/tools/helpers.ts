import type { AsanaClient } from "../client/asana.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Many Asana "instantiate"/"duplicate" endpoints return a job. The new resource
 * gid is usually present in the POST response, but poll the job briefly otherwise.
 * `field` is the job field holding the new resource (e.g. "new_project", "new_task").
 */
export async function resolveJobResource(
  client: AsanaClient,
  job: any,
  field: string,
): Promise<{ gid: string; status?: string }> {
  let gid: string | undefined = job?.[field]?.gid;
  let status: string | undefined = job?.status;
  for (let i = 0; i < 8 && !gid; i++) {
    await delay(700);
    const j = await client.request<any>("GET", `/jobs/${job.gid}`, undefined, {
      opt_fields: `status,${field}.gid,${field}.name`,
    });
    status = j?.status;
    gid = j?.[field]?.gid;
    if (status === "succeeded" || status === "failed") break;
  }
  if (!gid) {
    throw new Error(
      `Job ${job?.gid} did not produce ${field} (status ${status ?? "unknown"})`,
    );
  }
  return { gid, status };
}

/** Drop undefined keys so we never send a half-empty data payload. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
