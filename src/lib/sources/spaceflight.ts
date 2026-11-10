import { HOUR_MS, type Article } from "../types";
import { cleanText, expectArray, getJson } from "./http";

/*
 * Spaceflight News API (https://spaceflightnewsapi.net): keyless space news
 * from many outlets. One request covers the window.
 */
export interface SpaceflightArticle {
  id: number;
  title: string;
  url: string;
  summary: string | null;
  published_at: string;
  /** The outlet, e.g. "NASA", "SpaceNews". */
  news_site: string;
}

export interface SpaceflightResponse {
  results: SpaceflightArticle[];
}

export function parseSpaceflight(raw: SpaceflightResponse): Article[] {
  return expectArray<SpaceflightArticle>("Spaceflight News", "results", raw.results)
    .filter((a) => a.title && a.url)
    .map((a) => ({
      id: `spaceflight:${a.id}`,
      source: "spaceflight" as const,
      kind: "press" as const,
      title: cleanText(a.title, 400),
      description: cleanText(a.summary),
      url: a.url,
      outlet: a.news_site || "Spaceflight News",
      publishedAt: Date.parse(a.published_at) || 0,
    }));
}

export async function fetchSpaceflight(now: number, windowHours: number): Promise<SpaceflightResponse> {
  const params = new URLSearchParams({
    published_at_gte: new Date(now - windowHours * HOUR_MS).toISOString(),
    limit: "500",
    ordering: "-published_at",
  });
  const body = await getJson<SpaceflightResponse>(
    "Spaceflight News",
    `https://api.spaceflightnewsapi.net/v4/articles/?${params}`,
  );
  return {
    results: expectArray<SpaceflightArticle>("Spaceflight News", "results", body.results).map(
      ({ id, title, url, summary, published_at, news_site }) => ({
        id,
        title,
        url,
        summary: cleanText(summary, 400),
        published_at,
        news_site,
      }),
    ),
  };
}
