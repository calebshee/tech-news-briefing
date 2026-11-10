import type { Article } from "../types";

/** Raw shape of one Algolia HN search hit (only the fields we use). */
export interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  created_at_i: number;
  story_text?: string | null;
}

export interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

const MIN_POINTS = 20;

export function hnRequestUrl(now: number, windowHours: number): string {
  const since = Math.floor(now / 1000) - windowHours * 3600;
  const params = new URLSearchParams({
    tags: "story",
    numericFilters: `created_at_i>${since},points>${MIN_POINTS}`,
    hitsPerPage: "200",
  });
  return `https://hn.algolia.com/api/v1/search_by_date?${params}`;
}

export function parseHn(raw: AlgoliaResponse): Article[] {
  return raw.hits
    .filter((h) => h.title)
    .map((h) => {
      const discussionUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
      return {
        id: `hn:${h.objectID}`,
        source: "hn" as const,
        title: h.title!.trim(),
        description: stripHtml(h.story_text ?? "").slice(0, 300),
        url: h.url || discussionUrl,
        outlet: "Hacker News",
        publishedAt: h.created_at_i * 1000,
        hn: {
          points: h.points ?? 0,
          comments: h.num_comments ?? 0,
          discussionUrl,
        },
      };
    });
}

export async function fetchHn(now: number, windowHours: number): Promise<AlgoliaResponse> {
  const res = await fetch(hnRequestUrl(now, windowHours), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Algolia HN responded ${res.status}`);
  return (await res.json()) as AlgoliaResponse;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}
