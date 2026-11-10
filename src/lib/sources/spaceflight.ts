import { HOUR_MS, type Article } from "../types";

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
  return (raw.results ?? [])
    .filter((a) => a.title && a.url)
    .map((a) => ({
      id: `spaceflight:${a.id}`,
      source: "spaceflight" as const,
      title: a.title.trim(),
      description: (a.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
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
  const res = await fetch(`https://api.spaceflightnewsapi.net/v4/articles/?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Spaceflight News responded ${res.status}`);
  const body = (await res.json()) as SpaceflightResponse;
  return {
    results: body.results.map(({ id, title, url, summary, published_at, news_site }) => ({
      id,
      title,
      url,
      summary: summary?.slice(0, 400) ?? null,
      published_at,
      news_site,
    })),
  };
}
