import type { Article } from "../types";

/*
 * Kiwi News (https://news.kiwistand.com): keyless, community-curated crypto
 * and Ethereum links. /api/v1/feeds/new always returns the latest 25.
 * Like Hacker News, it counts as one community outlet.
 */
export interface KiwiStory {
  index: string;
  title: string;
  href: string;
  /** Epoch seconds. */
  timestamp: number;
  upvotes?: number;
  metadata?: { ogDescription?: string | null; domain?: string | null } | null;
}

export interface KiwiResponse {
  data: { stories: KiwiStory[] };
}

export function parseKiwi(raw: KiwiResponse): Article[] {
  return (raw.data?.stories ?? [])
    .filter((s) => s.title && s.href)
    .map((s) => ({
      id: `kiwi:${s.index}`,
      source: "kiwi" as const,
      title: s.title.trim(),
      description: (s.metadata?.ogDescription ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      url: s.href,
      outlet: "Kiwi News",
      publishedAt: s.timestamp * 1000,
    }));
}

export async function fetchKiwi(): Promise<KiwiResponse> {
  const res = await fetch("https://news.kiwistand.com/api/v1/feeds/new", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Kiwi News responded ${res.status}`);
  const body = (await res.json()) as KiwiResponse;
  return {
    data: {
      stories: body.data.stories.map(({ index, title, href, timestamp, upvotes, metadata }) => ({
        index,
        title,
        href,
        timestamp,
        upvotes,
        metadata: { ogDescription: metadata?.ogDescription?.slice(0, 400) ?? null, domain: metadata?.domain ?? null },
      })),
    },
  };
}
