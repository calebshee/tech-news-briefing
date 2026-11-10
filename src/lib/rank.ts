import type { Article, Cluster, SourceId } from "./types";

const HOUR = 3600_000;

/** Headline preference: mainstream outlets first, HN last. */
const HEADLINE_PRIORITY: Record<SourceId, number> = { currents: 0, gridnews: 1, hn: 2 };

function normalisedTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Distinct independent outlets. Outlets are merged into one "voice" when
 * they ran the same headline (wire reprints) or GridNews gives them the
 * same voiceKey.
 */
export function coverageOf(articles: Article[]): number {
  const outlets = [...new Set(articles.map((a) => a.outlet))];
  const parent = new Map(outlets.map((o) => [o, o]));
  const find = (o: string): string => {
    const p = parent.get(o)!;
    if (p === o) return o;
    const r = find(p);
    parent.set(o, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  const firstOutletFor = new Map<string, string>();
  for (const a of articles) {
    const keys = [`t:${normalisedTitle(a.title)}`];
    if (a.gridnews) keys.push(`v:${a.gridnews.voiceKey}`);
    for (const k of keys) {
      const o = firstOutletFor.get(k);
      if (o === undefined) firstOutletFor.set(k, a.outlet);
      else union(o, a.outlet);
    }
  }
  return new Set(outlets.map(find)).size;
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
      ? { nextSource: next.source, hours: Math.round((next.publishedAt - first.publishedAt) / HOUR) }
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
    .sort((a, b) => b.engagement - a.engagement);
  const fillers = hnSingles.slice(0, Math.max(0, size - top.length)).map((c) => ({ ...c, fill: true }));
  const used = new Set([...top, ...fillers].map((c) => c.id));

  const alsoTrending: Record<SourceId, Cluster[]> = { hn: [], currents: [], gridnews: [] };
  const leftover = [...multi.slice(size), ...single].filter((c) => !used.has(c.id));
  for (const c of leftover) {
    const primary = c.sources.includes("hn") ? "hn" : c.sources[0];
    alsoTrending[primary].push(c);
  }
  alsoTrending.hn.sort((a, b) => b.engagement - a.engagement);
  alsoTrending.currents.sort((a, b) => b.firstSeen.at - a.firstSeen.at);
  alsoTrending.gridnews.sort(byRank);

  return { top: [...top, ...fillers], alsoTrending };
}
