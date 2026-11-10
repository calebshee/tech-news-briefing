/**
 * Every source the app knows, in display order. The registry
 * (sources/registry.ts) must define each one; tsc enforces that.
 */
export const SOURCE_IDS = ["hn", "sonto", "spaceflight", "deploylog", "kiwi", "gridnews"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/**
 * What kind of evidence an article is, which decides how it counts:
 * - press: a publisher's own reporting; each outlet is one voice.
 * - community: a link shared on HN, Kiwi, Lobsters…; all community
 *   sharing in a story counts as one voice together.
 * - release: a vendor's own announcement or integration listing; all of
 *   them in a story count as one voice together.
 * - markets: market coverage (GridNews), counted by its own voices.
 */
export type ArticleKind = "press" | "community" | "release" | "markets";

/** One article from any source, normalised to a common shape. */
export interface Article {
  /** Unique across sources, e.g. "hn:123". */
  id: string;
  source: SourceId;
  kind: ArticleKind;
  title: string;
  description: string;
  /** Link to the original article (for HN self-posts, the discussion page). */
  url: string;
  /**
   * Who published it: the domain for press articles, the site's name for
   * community posts ("Hacker News"), the vendor for releases.
   */
  outlet: string;
  /** Epoch milliseconds. */
  publishedAt: number;
  hn?: HnStats;
  /**
   * GridNews delivers pre-clustered events; each member outlet becomes one
   * Article that carries its event id so they stay together.
   */
  gridnews?: {
    eventId: string;
    /** Outlets sharing a voiceKey are reprints of one another. */
    voiceKey: string;
    /** GridNews's count of non-reprint outlets for the whole event. */
    independentVoices: number;
  };
}

export const HOUR_MS = 3_600_000;

export interface HnStats {
  points: number;
  comments: number;
  discussionUrl: string;
}

export type SourceState =
  | { status: "ok"; count: number }
  | { status: "error"; message: string }
  | { status: "disabled"; reason: string; /** Expected (e.g. a feature flag), so no notice is shown. */ quiet?: boolean };

export interface Cluster {
  id: string;
  headline: string;
  headlineUrl: string;
  articles: Article[];
  /**
   * Independent voices: distinct press outlets (reprints collapsed), plus
   * one for community sharing and one for vendor releases if present.
   */
  coverage: number;
  sources: SourceId[];
  /** Sum of HN points + comments across the cluster. */
  engagement: number;
  hn?: HnStats;
  firstSeen: { source: SourceId; outlet: string; at: number };
  /** Hours between the first source and the next different source, if any. */
  lead?: { nextSource: SourceId; hours: number };
  /** True when this cluster made the top list only to fill it up. */
  fill: boolean;
  /** True when every article is a community post (HN, Lobsters, Kiwi…). */
  communityOnly: boolean;
}

export interface Briefing {
  generatedAt: number;
  windowHours: number;
  top: Cluster[];
  alsoTrending: Record<SourceId, Cluster[]>;
  sourceStates: Record<SourceId, SourceState>;
  /** True when any data came from synthetic sample fixtures. */
  usesSampleData: boolean;
}
