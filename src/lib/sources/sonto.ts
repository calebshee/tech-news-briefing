import { HOUR_MS, type Article, type ArticleKind } from "../types";
import { domainOf } from "../url";
import { cleanText, expectArray, getJson } from "./http";

/*
 * Sonto (https://sonto.tech): keyless tech and AI news gathered from many
 * outlets. GET /api/news returns every item (~2 MB); `page`/`limit` are
 * ignored, so the adapter trims to the window itself.
 */
export interface SontoItem {
  title: string;
  link: string;
  /** Sonto's name for where it found the item, e.g. "TechCrunch", "Lobsters". */
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

/**
 * Link-sharing feeds inside Sonto. They re-post links rather than report,
 * so they count with HN as community voices, not as press outlets.
 */
const COMMUNITY_SOURCES = new Set(["Lobsters", "LAXIMA AI Signal", "AI Nexus Daily"]);

/** Sonto cuts titles at this length; Techmeme's run longer. */
const TITLE_CUT = 120;

export function parseSontoDate(s: string): number {
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`) || 0;
}

/**
 * Techmeme descriptions read "Author / Outlet: Full headline — summary".
 * When Sonto has cut the title, take the full one from there.
 */
export function fullTitle(title: string, description: string | null | undefined): string {
  const t = title.trim();
  if (t.length < TITLE_CUT - 2 || !description) return t;
  const body = description.replace(/^[^:—]{2,80}:\s+/, "");
  const head = body.split(/\s+—\s+/)[0].trim();
  return head.startsWith(t.slice(0, 40)) && head.length > t.length ? head : t;
}

export function parseSonto(raw: SontoResponse): Article[] {
  // A few items carry dates in the future; nothing can be newer than the feed.
  const latest = (Date.parse(raw.lastUpdated) || Date.now()) + HOUR_MS;
  const out: Article[] = [];
  const seen = new Set<string>();
  for (const i of expectArray<SontoItem>("Sonto", "items", raw.items)) {
    if (!i.title || !i.link || DUPLICATE_SOURCES.has(i.source) || seen.has(i.link)) continue;
    const publishedAt = parseSontoDate(i.date);
    if (!publishedAt || publishedAt > latest) continue;
    seen.add(i.link);
    const kind: ArticleKind = COMMUNITY_SOURCES.has(i.source) ? "community" : "press";
    out.push({
      id: `sonto:${i.link}`,
      source: "sonto",
      kind,
      title: fullTitle(i.title, i.description),
      description: cleanText(i.ai_summary || i.description),
      url: i.link,
      // Press counts by website, so "Bloomberg Tech" and "Bloomberg
      // Economics" are one outlet; community feeds go by their name.
      outlet: kind === "community" ? i.source : domainOf(i.link),
      publishedAt,
    });
  }
  return out;
}

/** One request; keeps only the window and the fields we use. */
export async function fetchSonto(now: number, windowHours: number): Promise<SontoResponse> {
  const body = await getJson<SontoResponse>("Sonto", "https://sonto.tech/api/news");
  const since = now - windowHours * HOUR_MS;
  return {
    lastUpdated: body.lastUpdated,
    items: expectArray<SontoItem>("Sonto", "items", body.items)
      .filter((i) => parseSontoDate(i.date) >= since)
      .map(({ title, link, source, date, description, ai_summary }) => ({
        title,
        link,
        source,
        date,
        description: cleanText(description, 400),
        ai_summary: cleanText(ai_summary, 400),
      })),
  };
}
