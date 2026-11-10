import type { Article } from "../types";
import { domainOf } from "../url";

/*
 * Shapes taken from the official SDK (github.com/gridnews/sdk, src/types.ts).
 * Only the fields this app reads are listed.
 */
export interface GridEventSource {
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  publishedAt: string;
  voiceKey: string;
}

export interface GridEvent {
  id: string;
  summary: string;
  description?: string;
  type: "article" | "press_release";
  firstSeenAt: string;
  independentVoices: number;
  sectors: string[];
  sources: GridEventSource[];
}

export interface GridEventsResponse {
  status: string;
  data: { events: GridEvent[] };
}

const BASE = "https://api.gridnews.io";

/** Keep only events about technology companies (spec: tech-company finance only). */
export function isTechEvent(e: GridEvent): boolean {
  return e.sectors.some((s) => /technology|software|semiconductor/i.test(s));
}

export function parseGridnews(raw: GridEventsResponse): Article[] {
  const out: Article[] = [];
  for (const e of raw.data?.events ?? []) {
    if (e.type !== "article" || !isTechEvent(e)) continue;
    e.sources.forEach((s, i) => {
      if (!s.url || !s.title) return;
      out.push({
        id: `gridnews:${e.id}:${i}`,
        source: "gridnews",
        title: s.title.trim(),
        description: (e.description ?? e.summary ?? "").trim(),
        url: s.url,
        outlet: domainOf(s.url),
        publishedAt: Date.parse(s.publishedAt || e.firstSeenAt) || 0,
        gridnews: {
          eventId: e.id,
          voiceKey: s.voiceKey || s.sourceId,
          independentVoices: e.independentVoices,
        },
      });
    });
  }
  return out;
}

/**
 * One request: journalism clusters from the window, most corroborated
 * first. List responses include a preview of member outlets, which is
 * enough here, so no per-event detail calls (saves quota and row budget).
 */
export async function fetchGridnews(apiKey: string, windowHours: number): Promise<GridEventsResponse> {
  const params = new URLSearchParams({
    hours: String(windowHours),
    type: "article",
    orderBy: "-independentVoices",
    limit: "50",
  });
  const res = await fetch(`${BASE}/api/query/events?${params}`, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GridNews responded ${res.status}`);
  return (await res.json()) as GridEventsResponse;
}
