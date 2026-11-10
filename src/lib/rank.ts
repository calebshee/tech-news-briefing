import { HOUR_MS, type Article, type Cluster, type SourceId } from "./types";
import { groupByKeys } from "./groupByKeys";

/** Headline preference: mainstream outlets first, HN last. */
const HEADLINE_PRIORITY: Record<SourceId, number> = { currents: 0, gridnews: 1, hn: 2 };

function normalisedTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Distinct independent outlets ("voices").
 * - Outlets that ran the same headline are wire reprints: one voice.
 * - Outlets GridNews gives the same voiceKey: one voice.
 * - Hacker News is always its own voice, even when a post reuses the
 *   publisher's headline (it is the developer signal, not a reprint).
 * - GridNews list responses only preview an event's outlets, so voices it
 *   counted but didn't list are added from its `independentVoices`.
 */
export function coverageOf(articles: Article[]): number {
  const byOutlet = new Map<string, Article[]>();
  for (const a of articles) byOutlet.set(a.outlet, [...(byOutlet.get(a.outlet) ?? []), a]);

  const voices = groupByKeys([...byOutlet.values()], (outletArticles) =>
    outletArticles.flatMap((a) => {
      if (a.source === "hn") return [];
      const keys = [`t:${normalisedTitle(a.title)}`];
      if (a.gridnews) keys.push(`v:${a.gridnews.voiceKey}`);
      return keys;
    }),
  ).length;

  const events = new Map<string, { claimed: number; listed: Set<string> }>();
  for (const a of articles) {
    if (!a.gridnews) continue;
    const e = events.get(a.gridnews.eventId) ?? { claimed: a.gridnews.independentVoices, listed: new Set() };
    e.listed.add(a.gridnews.voiceKey);
    events.set(a.gridnews.eventId, e);
  }
  let unlisted = 0;
  for (const e of events.values()) unlisted += Math.max(0, e.claimed - e.listed.size);

  return voices + unlisted;
}

export function toCluster(articles: Article[]): Cluster {
  const sorted = [...articles].sort((a, b) => a.publishedAt - b.publishedAt);
  const headlineArticle = [...sorted].sort(
    (a, b) => HEADLINE_PRIORITY[a.source] - HEADLINE_PRIORITY[b.source] || a.publishedAt - b.publishedAt,
  )[0];

  const hnPosts = sorted.filter((a) => a.hn);
  const topHn = [...hnPosts].sort((a, b) => b.hn!.points - a.hn!.points)[0];
  const hn = topHn
    ? {
        points: hnPosts.reduce((s, a) => s + a.hn!.points, 0),
        comments: hnPosts.reduce((s, a) => s + a.hn!.comments, 0),
        discussionUrl: topHn.hn!.discussionUrl,
      }
    : undefined;

  const first = sorted[0];
  const next = sorted.find((a) => a.source !== first.source);
  const sources = [...new Set(sorted.map((a) => a.source))];

  return {
    id: first.id,
    headline: headlineArticle.title,
    headlineUrl: headlineArticle.url,
    articles: sorted,
    coverage: coverageOf(sorted),
    sources,
    engagement: hn ? hn.points + hn.comments : 0,
    hn,
    firstSeen: { source: first.source, outlet: first.outlet, at: first.publishedAt },
    lead: next
      ? { nextSource: next.source, hours: Math.round((next.publishedAt - first.publishedAt) / HOUR_MS) }
      : undefined,
    fill: false,
  };
}

function byRank(a: Cluster, b: Cluster): number {
  return (
    b.coverage - a.coverage ||
    b.engagement - a.engagement ||
    b.articles.length - a.articles.length ||
    b.firstSeen.at - a.firstSeen.at
  );
}

/**
 * Top list: multi-outlet clusters by coverage then engagement. If there are
 * fewer than `size`, top up with the highest-point HN-only stories (marked
 * `fill`). Everything else goes to "Also trending" for its source.
 */
export function rankClusters(
  clusters: Cluster[],
  size = 10,
): { top: Cluster[]; alsoTrending: Record<SourceId, Cluster[]> } {
  const multi = clusters.filter((c) => c.coverage >= 2).sort(byRank);
  const single = clusters.filter((c) => c.coverage < 2);
  const top = multi.slice(0, size);

  const hnSingles = single
    .filter((c) => c.sources.includes("hn"))
    .sort((a, b) => (b.hn?.points ?? 0) - (a.hn?.points ?? 0));
  const fillers = hnSingles.slice(0, Math.max(0, size - top.length)).map((c) => ({ ...c, fill: true }));
  const used = new Set([...top, ...fillers].map((c) => c.id));

  const alsoTrending: Record<SourceId, Cluster[]> = { hn: [], currents: [], gridnews: [] };
  const leftover = [...multi.slice(size), ...single].filter((c) => !used.has(c.id));
  for (const c of leftover) {
    const primary = c.sources.includes("hn") ? "hn" : c.sources[0];
    alsoTrending[primary].push(c);
  }
  alsoTrending.hn.sort((a, b) => (b.hn?.points ?? 0) - (a.hn?.points ?? 0));
  alsoTrending.currents.sort((a, b) => b.firstSeen.at - a.firstSeen.at);
  alsoTrending.gridnews.sort(byRank);

  return { top: [...top, ...fillers], alsoTrending };
}
