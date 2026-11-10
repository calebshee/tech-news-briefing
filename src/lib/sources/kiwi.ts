import type { Article } from "../types";
import { cleanText, expectArray, getJson } from "./http";

/*
 * Kiwi News (https://news.kiwistand.com): keyless, community-curated crypto
 * and Ethereum links. /api/v1/feeds/new always returns the latest 25.
 * Like Hacker News, its posts are community voices.
 */
export interface KiwiStory {
  index: string;
  title: string;
  href: string;
  /** Epoch seconds. */
  timestamp: number;
  metadata?: { ogDescription?: string | null } | null;
}

export interface KiwiResponse {
  data: { stories: KiwiStory[] };
}

export function parseKiwi(raw: KiwiResponse): Article[] {
  return expectArray<KiwiStory>("Kiwi News", "stories", raw.data?.stories)
    .filter((s) => s.title && s.href)
    .map((s) => ({
      id: `kiwi:${s.index}`,
      source: "kiwi" as const,
      kind: "community" as const,
      title: cleanText(s.title, 400),
      description: cleanText(s.metadata?.ogDescription),
      url: s.href,
      outlet: "Kiwi News",
      publishedAt: s.timestamp * 1000,
    }));
}

export async function fetchKiwi(): Promise<KiwiResponse> {
  const body = await getJson<KiwiResponse>("Kiwi News", "https://news.kiwistand.com/api/v1/feeds/new");
  return {
    data: {
      stories: expectArray<KiwiStory>("Kiwi News", "stories", body.data?.stories).map(
        ({ index, title, href, timestamp, metadata }) => ({
          index,
          title,
          href,
          timestamp,
          metadata: { ogDescription: cleanText(metadata?.ogDescription, 400) },
        }),
      ),
    },
  };
}
