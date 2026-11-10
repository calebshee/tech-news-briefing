import type { Article } from "../types";
import { cleanText, expectArray, getJson } from "./http";

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
  return expectArray<AlgoliaHit>("Algolia HN", "hits", raw.hits)
    .filter((h) => h.title)
    .map((h) => {
      const discussionUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
      return {
        id: `hn:${h.objectID}`,
        source: "hn" as const,
        kind: "community" as const,
        title: h.title!.trim(),
        description: cleanText(stripHtml(h.story_text ?? "")),
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

export function fetchHn(now: number, windowHours: number): Promise<AlgoliaResponse> {
  return getJson<AlgoliaResponse>("Algolia HN", hnRequestUrl(now, windowHours));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
}
