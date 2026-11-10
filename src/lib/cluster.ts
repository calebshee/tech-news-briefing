import type { Article } from "./types";
import { canonicalUrl } from "./url";
import { groupByKeys } from "./groupByKeys";
import { addInto, cosine, entities, normalise, tfidfVectors, type Vector } from "./similarity";

export interface ClusterOptions {
  /** Minimum similarity to join a cluster when headlines share a name. */
  threshold: number;
  /** Stricter bar when both sides name things but share none of them. */
  disjointEntityThreshold: number;
  /** Added per shared entity (name, product, version), capped at 2. */
  entityBoost: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  threshold: 0.3,
  disjointEntityThreshold: 0.6,
  entityBoost: 0.08,
};

/**
 * Groups articles about the same event. Swappable: anything with this
 * signature (e.g. an embeddings-based version) can replace it.
 *
 * 1. Hard links: same canonical URL, or same GridNews event.
 * 2. Greedy centroid matching on TF-IDF title+description similarity,
 *    boosted by shared entities. Centroids (not single links) stop a
 *    bridging headline from chaining two unrelated stories together.
 */
export function clusterArticles(
  articles: Article[],
  options: Partial<ClusterOptions> = {},
): Article[][] {
  const opt = { ...DEFAULT_CLUSTER_OPTIONS, ...options };
  if (articles.length === 0) return [];

  const groups = hardLinkGroups(articles);
  const vectors = tfidfVectors(articles);
  const index = new Map(articles.map((a, i) => [a.id, i]));

  type Working = {
    members: Article[];
    sum: Vector;
    centroid: Vector;
    entityCounts: Map<string, number>;
    ents: Set<string>;
  };
  const seeds: Working[] = groups.map((members) => {
    const sum: Vector = new Map();
    const entityCounts = new Map<string, number>();
    for (const a of members) {
      addInto(sum, vectors[index.get(a.id)!]);
      for (const e of entities(a.title)) entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1);
    }
    return { members, sum, centroid: normalise(sum), entityCounts, ents: coreEntities(entityCounts, members.length) };
  });

  // Big, high-engagement groups first so they become the centroids.
  seeds.sort((a, b) => b.members.length - a.members.length || weight(b.members) - weight(a.members));

  const clusters: Working[] = [];
  for (const seed of seeds) {
    let best: Working | undefined;
    let bestScore = -1;
    for (const c of clusters) {
      const score = matchScore(seed, c, opt);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore >= 0) {
      best.members.push(...seed.members);
      addInto(best.sum, seed.sum);
      best.centroid = normalise(best.sum);
      for (const [e, n] of seed.entityCounts) best.entityCounts.set(e, (best.entityCounts.get(e) ?? 0) + n);
      best.ents = coreEntities(best.entityCounts, best.members.length);
    } else {
      clusters.push(seed);
    }
  }
  return clusters.map((c) => c.members);
}

/** Returns a non-negative score when `a` should join `b`, else -1. */
function matchScore(
  a: { centroid: Vector; ents: Set<string> },
  b: { centroid: Vector; ents: Set<string> },
  opt: ClusterOptions,
): number {
  const sim = cosine(a.centroid, b.centroid);
  let shared = 0;
  for (const e of a.ents) if (b.ents.has(e)) shared++;
  const disjoint = shared === 0 && a.ents.size > 0 && b.ents.size > 0;
  const score = sim + Math.min(shared, 2) * opt.entityBoost;
  const bar = disjoint ? opt.disjointEntityThreshold : opt.threshold;
  return score >= bar ? score : -1;
}

/**
 * Entities named by more than half of a cluster's members. Using only the
 * shared core stops one bridging headline from importing new names that
 * would then pull in an unrelated story.
 */
function coreEntities(counts: Map<string, number>, size: number): Set<string> {
  if (size === 1) return new Set(counts.keys());
  return new Set([...counts].filter(([, n]) => n * 2 > size).map(([e]) => e));
}

function weight(members: Article[]): number {
  return members.reduce((s, a) => s + (a.hn?.points ?? 0), 0);
}

/** Hard links: identical canonical URL or the same GridNews event. */
function hardLinkGroups(articles: Article[]): Article[][] {
  return groupByKeys(articles, (a) =>
    a.gridnews ? [`url:${canonicalUrl(a.url)}`, `grid:${a.gridnews.eventId}`] : [`url:${canonicalUrl(a.url)}`],
  );
}
