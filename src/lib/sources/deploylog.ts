import { HOUR_MS, type Article } from "../types";
import { cleanText, expectArray, getJson } from "./http";

/*
 * The Deploy Log (https://deployedbyai.com/log/): keyless log of AI product
 * and model releases, each linked to the vendor's own announcement.
 * Licensed CC BY 4.0, so credit is required (see the registry attribution).
 * data.json holds every row (~2 MB); the adapter trims to the window.
 */
export interface DeployLogRow {
  row_key: string;
  /** The vendor, e.g. "Amazon Web Services". */
  company: string;
  subject: string;
  what_shipped: string | null;
  source_url: string;
  /** Day the vendor published it, e.g. "2026-11-10" (may be null). */
  published_date: string | null;
  /** ISO timestamp when the row was logged, which can be days later. */
  added_at: string;
}

export interface DeployLogResponse {
  rows: DeployLogRow[];
}

/**
 * When it shipped: the logging time if logged on the publication day,
 * otherwise midday UTC of the publication day, so a release logged days
 * late doesn't look fresh.
 */
export function shippedAt(row: Pick<DeployLogRow, "published_date" | "added_at">): number {
  const added = Date.parse(row.added_at) || 0;
  if (!row.published_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.published_date)) return added;
  if (row.added_at.startsWith(row.published_date)) return added;
  return Math.min(added, Date.parse(`${row.published_date}T12:00:00Z`));
}

export function parseDeployLog(raw: DeployLogResponse): Article[] {
  return (
    expectArray<DeployLogRow>("The Deploy Log", "rows", raw.rows)
      .filter((r) => r.subject && r.source_url)
      // The title is the subject alone: prefixing the company would give
      // every release from a busy vendor ("Google Cloud: …") two shared
      // headline words and merge unrelated launches. The card shows the
      // vendor as the outlet instead.
      .map((r) => ({
        id: `deploylog:${r.row_key}`,
        source: "deploylog" as const,
        kind: "release" as const,
        title: cleanText(r.subject, 400),
        description: cleanText(r.what_shipped),
        url: r.source_url,
        outlet: r.company || "The Deploy Log",
        publishedAt: shippedAt(r),
      }))
  );
}

/** One request; keeps the rows that shipped or were logged in the window. */
export async function fetchDeployLog(now: number, windowHours: number): Promise<DeployLogResponse> {
  const body = await getJson<DeployLogResponse>("The Deploy Log", "https://deployedbyai.com/log/data.json");
  const since = now - windowHours * HOUR_MS;
  return {
    rows: expectArray<DeployLogRow>("The Deploy Log", "rows", body.rows)
      .filter((r) => (Date.parse(r.added_at) || 0) >= since)
      .map(({ row_key, company, subject, what_shipped, source_url, published_date, added_at }) => ({
        row_key,
        company,
        subject,
        what_shipped: cleanText(what_shipped, 400),
        source_url,
        published_date,
        added_at,
      })),
  };
}
