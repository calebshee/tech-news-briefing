import { HOUR_MS, type Article } from "../types";

/*
 * The Deploy Log (https://deployedbyai.com/log/): keyless log of AI product
 * and model releases, each linked to the vendor's own announcement.
 * Licensed CC BY 4.0, so credit is required (see the registry attribution).
 * data.json holds every row (~2 MB); the adapter trims to the window.
 */
export interface DeployLogRow {
  row_key: string;
  /** The vendor, e.g. "Amazon Web Services". Counts as the outlet. */
  company: string;
  subject: string;
  what_shipped: string | null;
  source_url: string;
  /** ISO timestamp when the row was logged. */
  added_at: string;
}

export interface DeployLogResponse {
  rows: DeployLogRow[];
}

export function parseDeployLog(raw: DeployLogResponse): Article[] {
  return (raw.rows ?? [])
    .filter((r) => r.subject && r.source_url)
    // The title is the subject alone: prefixing the company would give every
    // release from a busy vendor ("Google Cloud: …") two shared headline
    // words and merge unrelated launches. The card shows the company as
    // the outlet instead.
    .map((r) => ({
      id: `deploylog:${r.row_key}`,
      source: "deploylog" as const,
      title: r.subject.trim(),
      description: (r.what_shipped ?? "").trim().slice(0, 300),
      url: r.source_url,
      outlet: r.company || "The Deploy Log",
      publishedAt: Date.parse(r.added_at) || 0,
    }));
}

/** One request; keeps only the window and the fields we use. */
export async function fetchDeployLog(now: number, windowHours: number): Promise<DeployLogResponse> {
  const res = await fetch("https://deployedbyai.com/log/data.json", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`The Deploy Log responded ${res.status}`);
  const body = (await res.json()) as DeployLogResponse;
  const since = now - windowHours * HOUR_MS;
  return {
    rows: body.rows
      .filter((r) => Date.parse(r.added_at) >= since)
      .map(({ row_key, company, subject, what_shipped, source_url, added_at }) => ({
        row_key,
        company,
        subject,
        what_shipped,
        source_url,
        added_at,
      })),
  };
}
