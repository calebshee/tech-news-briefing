import { HOUR_MS, SOURCE_IDS, type Article, type ArticleKind, type Cluster, type SourceId } from "./types";
import { groupByKeys } from "./groupByKeys";

/** How a source's "Also" column is ordered. */
export type ColumnOrder = "points" | "recent" | "coverage";

/** Headline preference: press first, then markets, community posts, and vendor release notes last. */
const HEADLINE_PRIORITY: Record<ArticleKind, number> = { press: 0, markets: 1, community: 2, release: 3 };

function normalisedTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Independent voices covering a story:
 * - Each press or markets outlet is a voice, but outlets that ran the same
 *   headline (wire reprints) or share a GridNews voiceKey count once.
 * - All community posts together (HN, Kiwi, Lobsters…) count as one voice:
 *   sharing a link is one signal, however many sites echo it.
 * - All vendor release notes together count as one voice: integration
 *   listings (Vercel, AWS, OpenRouter…) are not independent coverage.
 * - GridNews list responses only preview an event's outlets, so voices it
 *   counted but didn't list are added from its `independentVoices`.
 */
export function coverageOf(articles: Article[]): number {
  const reporting = articles.filter((a) => a.kind === "press" || a.kind === "markets");
  const byOutlet = new Map<string, Article[]>();
  for (const a of reporting) byOutlet.set(a.outlet, [...(byOutlet.get(a.outlet) ?? []), a]);

  const outletVoices = groupByKeys([...byOutlet.values()], (outletArticles) =>
    outletArticles.flatMap((a) => (a.gridnews ? [`t:${normalisedTitle(a.title)}`, `v:${a.gridnews.voiceKey}`] : [`t:${normalisedTitle(a.title)}`])),
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

  const community = articles.some((a) => a.kind === "community") ? 1 : 0;
  const releases = articles.some((a) => a.kind === "release") ? 1 : 0;
  return outletVoices + unlisted + community + releases;
}

export function toCluster(articles: Article[]): Cluster {
  const sorted = [...articles].sort((a, b) => a.publishedAt - b.publishedAt);
  const headlineArticle = [...sorted].sort(
    (a, b) => HEADLINE_PRIORITY[a.kind] - HEADLINE_PRIORITY[b.kind] || a.publishedAt - b.publishedAt,
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
    communityOnly: sorted.every((a) => a.kind === "community"),
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

const COLUMN_SORT: Record<ColumnOrder, (a: Cluster, b: Cluster) => number> = {
  points: (a, b) => (b.hn?.points ?? 0) - (a.hn?.points ?? 0),
  recent: (a, b) => b.firstSeen.at - a.firstSeen.at,
  coverage: byRank,
};

/**
 * Top list: multi-voice clusters by coverage then engagement. If there are
 * fewer than `size`, top up with the highest-point community-only stories
 * that reached Hacker News (marked `fill`). Everything else goes to its
 * source's "Also" column, ordered as `columnOrder` says (default: newest).
 */
export function rankClusters(
  clusters: Cluster[],
  size = 10,
  columnOrder: Partial<Record<SourceId, ColumnOrder>> = {},
): { top: Cluster[]; alsoTrending: Record<SourceId, Cluster[]> } {
  const multi = clusters.filter((c) => c.coverage >= 2).sort(byRank);
  const single = clusters.filter((c) => c.coverage < 2);
  const top = multi.slice(0, size);

  const hnSingles = single
    .filter((c) => c.sources.includes("hn"))
    .sort((a, b) => (b.hn?.points ?? 0) - (a.hn?.points ?? 0));
  const fillers = hnSingles.slice(0, Math.max(0, size - top.length)).map((c) => ({ ...c, fill: true }));
  const used = new Set([...top, ...fillers].map((c) => c.id));

  const alsoTrending = Object.fromEntries(SOURCE_IDS.map((id) => [id, [] as Cluster[]])) as Record<SourceId, Cluster[]>;
  const leftover = [...multi.slice(size), ...single].filter((c) => !used.has(c.id));
  for (const c of leftover) {
    const primary = c.sources.includes("hn") ? "hn" : c.sources[0];
    alsoTrending[primary].push(c);
  }
  for (const id of SOURCE_IDS) alsoTrending[id].sort(COLUMN_SORT[columnOrder[id] ?? "recent"]);

  return { top: [...top, ...fillers], alsoTrending };
}
