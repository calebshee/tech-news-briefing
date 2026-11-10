import type { Article } from "./types";
import { canonicalUrl } from "./url";
import { groupByKeys } from "./groupByKeys";
import { addInto, cosine, entities, normalise, tfidfVectors, tokenize, type Vector } from "./similarity";

export interface ClusterOptions {
  /** Minimum similarity to join a cluster when headlines share a name. */
  threshold: number;
  /** Stricter bar when both sides name things but share none of them. */
  disjointEntityThreshold: number;
  /** Added per shared rare entity (name, product, version), capped at 2. */
  entityBoost: number;
  /** Headlines must share at least this many meaningful words. */
  minSharedTitleWords: number;
  /**
   * A name only counts as evidence if at most this share of all articles
   * use it: "AWS" or "Google" on a busy news day says little.
   */
  rareEntityShare: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  threshold: 0.3,
  disjointEntityThreshold: 0.6,
  entityBoost: 0.08,
  minSharedTitleWords: 2,
  rareEntityShare: 0.02,
};

interface Working {
  members: Article[];
  sum: Vector;
  centroid: Vector;
  entityCounts: Map<string, number>;
  /** Entities named by most members. */
  ents: Set<string>;
  wordCounts: Map<string, number>;
  /** Headline words used by most members. */
  words: Set<string>;
}

/**
 * Groups articles about the same event. Swappable: anything with this
 * signature (e.g. an embeddings-based version) can replace it.
 *
 * 1. Hard links: same canonical URL, or same GridNews event.
 * 2. Greedy centroid matching on TF-IDF title+description similarity,
 *    boosted by shared rare names, and only between headlines that share
 *    at least two meaningful words. Centroids (not single links) stop a
 *    bridging headline from chaining two unrelated stories together.
 */
export function clusterArticles(articles: Article[], options: Partial<ClusterOptions> = {}): Article[][] {
  const opt = { ...DEFAULT_CLUSTER_OPTIONS, ...options };
  if (articles.length === 0) return [];

  const groups = hardLinkGroups(articles);
  const vectors = tfidfVectors(articles);
  const index = new Map(articles.map((a, i) => [a.id, i]));

  // How many articles name each entity, to tell rare names from common ones.
  const entityDf = new Map<string, number>();
  for (const a of articles) for (const e of entities(a.title)) entityDf.set(e, (entityDf.get(e) ?? 0) + 1);
  const rareLimit = Math.max(3, Math.ceil(articles.length * opt.rareEntityShare));
  const isRare = (e: string) => (entityDf.get(e) ?? 0) <= rareLimit;

  const seeds: Working[] = groups.map((members) => {
    const sum: Vector = new Map();
    const entityCounts = new Map<string, number>();
    const wordCounts = new Map<string, number>();
    for (const a of members) {
      addInto(sum, vectors[index.get(a.id)!]);
      for (const e of entities(a.title)) entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1);
      for (const w of new Set(tokenize(a.title))) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
    return {
      members,
      sum,
      centroid: normalise(sum),
      entityCounts,
      ents: core(entityCounts, members.length),
      wordCounts,
      words: core(wordCounts, members.length),
    };
  });

  // Big, high-engagement groups first so they become the centroids.
  seeds.sort((a, b) => b.members.length - a.members.length || weight(b.members) - weight(a.members));

  const clusters: Working[] = [];
  for (const seed of seeds) {
    let best: Working | undefined;
    let bestScore = -1;
    for (const c of clusters) {
      const score = matchScore(seed, c, opt, isRare);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore >= 0) {
      best.members.push(...seed.members);
      addInto(best.sum, seed.sum);
      best.centroid = normalise(best.sum);
      merge(best.entityCounts, seed.entityCounts);
      merge(best.wordCounts, seed.wordCounts);
      best.ents = core(best.entityCounts, best.members.length);
      best.words = core(best.wordCounts, best.members.length);
    } else {
      clusters.push(seed);
    }
  }
  return clusters.map((c) => c.members);
}

/** Returns a non-negative score when `a` should join `b`, else -1. */
function matchScore(a: Working, b: Working, opt: ClusterOptions, isRare: (e: string) => boolean): number {
  let sharedWords = 0;
  for (const w of a.words) if (b.words.has(w)) sharedWords++;
  if (sharedWords < opt.minSharedTitleWords) return -1;

  // Any shared name avoids the "names different things" penalty (a name can
  // be common precisely because one story dominates the day), but only rare
  // names earn the bonus.
  let shared = 0;
  let sharedRare = 0;
  for (const e of a.ents) {
    if (!b.ents.has(e)) continue;
    shared++;
    if (isRare(e)) sharedRare++;
  }
  const disjoint = shared === 0 && a.ents.size > 0 && b.ents.size > 0;

  const score = cosine(a.centroid, b.centroid) + Math.min(sharedRare, 2) * opt.entityBoost;
  const bar = disjoint ? opt.disjointEntityThreshold : opt.threshold;
  return score >= bar ? score : -1;
}

function merge(into: Map<string, number>, from: Map<string, number>): void {
  for (const [k, n] of from) into.set(k, (into.get(k) ?? 0) + n);
}

/**
 * Entities (or words) used by more than half of a cluster's members. Using
 * only the shared core stops one bridging headline from importing new
 * names that would then pull in an unrelated story.
 */
function core(counts: Map<string, number>, size: number): Set<string> {
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
