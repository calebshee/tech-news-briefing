export type SourceId = "hn" | "currents" | "gridnews";

export const SOURCE_LABEL: Record<SourceId, string> = {
  hn: "Hacker News",
  currents: "Currents",
  gridnews: "GridNews",
};

/** One article from any source, normalised to a common shape. */
export interface Article {
  /** Unique across sources, e.g. "hn:123". */
  id: string;
  source: SourceId;
  title: string;
  description: string;
  /** Link to the original article (for HN self-posts, the discussion page). */
  url: string;
  /**
   * The publisher this article counts as for coverage. HN items are always
   * "Hacker News" (the developer signal), never the domain they link to.
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
  /** Distinct independent outlets, with wire reprints collapsed. */
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
