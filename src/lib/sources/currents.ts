import type { Article } from "../types";
import { domainOf } from "../url";

/** Raw shape of a Currents article (from the official swagger "News" schema). */
export interface CurrentsNews {
  id: string;
  title: string;
  description: string | null;
  url: string;
  author: string | null;
  image: string | null;
  language: string;
  category: string[];
  published: string;
}

export interface CurrentsResponse {
  status: string;
  news: CurrentsNews[];
  msg?: string;
}

const BASE = "https://api.currentsapi.services/v1";
export const CURRENTS_CATEGORIES = ["technology", "business"] as const;
const PAGE_SIZE = 20; // free-tier maximum
const MAX_PAGES_PER_CATEGORY = 8;

/** Currents dates look like "2026-11-10 08:15:00 +0000". */
export function parseCurrentsDate(s: string): number {
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})?/);
  if (m) return Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`);
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export function parseCurrents(raw: CurrentsResponse): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const n of raw.news ?? []) {
    if (!n.title || !n.url || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push({
      id: `currents:${n.id}`,
      source: "currents",
      title: n.title.trim(),
      description: (n.description ?? "").trim(),
      url: n.url,
      outlet: domainOf(n.url),
      publishedAt: parseCurrentsDate(n.published),
    });
  }
  return out;
}

/**
 * Fetch the last `windowHours` of English technology + business news.
 * Uses /search because /latest-news has no date filter. Stops paging a
 * category as soon as a page comes back short. At most 16 requests.
 */
export async function fetchCurrents(
  apiKey: string,
  now: number,
  windowHours: number,
): Promise<CurrentsResponse> {
  const startDate = new Date(now - windowHours * 3600_000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const news: CurrentsNews[] = [];
  for (const category of CURRENTS_CATEGORIES) {
    for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
      const params = new URLSearchParams({
        language: "en",
        category,
        start_date: startDate,
        page_size: String(PAGE_SIZE),
        page_number: String(page),
      });
      const res = await fetch(`${BASE}/search?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (res.status === 429) throw new Error("Currents daily quota exhausted (HTTP 429)");
      if (!res.ok) throw new Error(`Currents responded ${res.status}`);
      const body = (await res.json()) as CurrentsResponse;
      if (body.status !== "ok") throw new Error(`Currents error: ${body.msg ?? body.status}`);
      news.push(...body.news);
      if (body.news.length < PAGE_SIZE) break;
    }
  }
  return { status: "ok", news };
}
