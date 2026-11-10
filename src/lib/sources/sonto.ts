import { HOUR_MS, type Article } from "../types";

/*
 * Sonto (https://sonto.tech): keyless tech and AI news gathered from many
 * outlets. GET /api/news returns every item (~2 MB); `page`/`limit` are
 * ignored, so the adapter trims to the window itself.
 */
export interface SontoItem {
  title: string;
  link: string;
  /** The outlet, e.g. "TechCrunch", "Wired". */
  source: string;
  /** UTC without a timezone suffix, e.g. "2026-11-10T05:40:02". */
  date: string;
  description?: string | null;
  ai_summary?: string | null;
}

export interface SontoResponse {
  lastUpdated: string;
  items: SontoItem[];
}

/** Sonto re-publishes Hacker News; we already read HN directly. */
const DUPLICATE_SOURCES = new Set(["Hacker News", "HN Best"]);

export function parseSontoDate(s: string): number {
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`) || 0;
}

export function parseSonto(raw: SontoResponse): Article[] {
  // A few items carry dates in the future; nothing can be newer than the feed.
  const latest = (Date.parse(raw.lastUpdated) || Date.now()) + HOUR_MS;
  const out: Article[] = [];
  const seen = new Set<string>();
  for (const i of raw.items ?? []) {
    if (!i.title || !i.link || DUPLICATE_SOURCES.has(i.source) || seen.has(i.link)) continue;
    const publishedAt = parseSontoDate(i.date);
    if (!publishedAt || publishedAt > latest) continue;
    seen.add(i.link);
    out.push({
      id: `sonto:${i.link}`,
      source: "sonto",
      title: i.title.trim(),
      description: (i.ai_summary || i.description || "").replace(/\s+/g, " ").trim().slice(0, 300),
      url: i.link,
      outlet: i.source || "Sonto",
      publishedAt,
    });
  }
  return out;
}

/** One request; keeps only the window and the fields we use. */
export async function fetchSonto(now: number, windowHours: number): Promise<SontoResponse> {
  const res = await fetch("https://sonto.tech/api/news", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Sonto responded ${res.status}`);
  const body = (await res.json()) as SontoResponse;
  const since = now - windowHours * HOUR_MS;
  return {
    lastUpdated: body.lastUpdated,
    items: body.items
      .filter((i) => parseSontoDate(i.date) >= since)
      .map(({ title, link, source, date, description, ai_summary }) => ({
        title,
        link,
        source,
        date,
        description: description?.slice(0, 400) ?? null,
        ai_summary: ai_summary?.slice(0, 400) ?? null,
      })),
  };
}
