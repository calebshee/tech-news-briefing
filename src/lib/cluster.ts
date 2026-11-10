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
  /** Headlines must share at least this many meaningful words (one more if either side has no summary). */
  minSharedTitleWords: number;
  /**
   * A name only counts as evidence if at most this share of all articles
   * use it: "AWS" or "Google" on a busy news day says little.
   */
  rareEntityShare: number;
  /** Extra similarity required when either side is a bare headline (no summary). */
  bareHeadlinePenalty: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  threshold: 0.3,
  disjointEntityThreshold: 0.6,
  entityBoost: 0.08,
  minSharedTitleWords: 2,
  rareEntityShare: 0.02,
  bareHeadlinePenalty: 0.1,
};

/**
 * Counts how many members of a group use each word or name, and keeps the
 * group's "core": the ones enough members share to speak for the group.
 */
class Tally {
  readonly counts = new Map<string, number>();
  core = new Set<string>();

  constructor(private readonly rule: (count: number, size: number) => boolean, private readonly minCore = 0) {}

  add(items: Iterable<string>): void {
    for (const k of new Set(items)) this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }

  absorb(other: Tally): void {
    for (const [k, n] of other.counts) this.counts.set(k, (this.counts.get(k) ?? 0) + n);
  }

  /** Recomputes the core for a group of `size` members. */
  settle(size: number): void {
    if (size === 1) {
      this.core = new Set(this.counts.keys());
      return;
    }
    const ranked = [...this.counts].sort((a, b) => b[1] - a[1]);
    const kept = ranked.filter(([, n]) => this.rule(n, size));
    // Never let the core shrink below the few most-used items, or a big,
    // varied group would stop accepting new members.
    const floor = ranked.slice(0, this.minCore).filter(([, n]) => n >= 2);
    this.core = new Set([...kept, ...floor].map(([k]) => k));
  }
}

/**
 * Names must be used by a majority of members: one bridging headline must
 * not import names that would then pull in an unrelated story.
 */
const nameTally = () => new Tally((n, size) => n * 2 > size);
/** Headline words are looser: a quarter of members, at least the top 3. */
const wordTally = () => new Tally((n, size) => n >= 2 && n * 4 >= size, 3);

interface Working {
  members: Article[];
  sum: Vector;
  centroid: Vector;
  names: Tally;
  words: Tally;
  /** False when every member is a bare headline (HN posts have no summary). */
  hasSummary: boolean;
}

/** A summary long enough to add real evidence beyond the headline. */
const hasSummary = (a: Article) => a.description.length >= 40;

/**
 * Groups articles about the same event. Swappable: anything with this
 * signature (e.g. an embeddings-based version) can replace it.
 *
 * 1. Hard links: same canonical URL, or same GridNews event.
 * 2. Greedy centroid matching on TF-IDF title+description similarity,
 *    boosted by shared rare names, and only between headlines that share
 *    enough meaningful words. Centroids (not single links) stop a
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
    const names = nameTally();
    const words = wordTally();
    for (const a of members) {
      addInto(sum, vectors[index.get(a.id)!]);
      names.add(entities(a.title));
      words.add(tokenize(a.title));
    }
    names.settle(members.length);
    words.settle(members.length);
    return { members, sum, centroid: normalise(sum), names, words, hasSummary: members.some(hasSummary) };
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
      best.names.absorb(seed.names);
      best.words.absorb(seed.words);
      best.names.settle(best.members.length);
      best.words.settle(best.members.length);
      best.hasSummary ||= seed.hasSummary;
    } else {
      clusters.push(seed);
    }
  }
  return clusters.map((c) => c.members);
}

/** Returns a non-negative score when `a` should join `b`, else -1. */
function matchScore(a: Working, b: Working, opt: ClusterOptions, isRare: (e: string) => boolean): number {
  // Very short headlines ("GPT-5") can't share two words: then all of the
  // shorter one's words must match.
  // A bare headline (no summary) gives little to compare, so it must share
  // one more word: two shared words matched HN posts to unrelated stories.
  const minWords = opt.minSharedTitleWords + (a.hasSummary && b.hasSummary ? 0 : 1);
  const needed = Math.min(minWords, a.words.core.size, b.words.core.size);
  let sharedWords = 0;
  let sharedCommonNames = 0;
  for (const w of a.words.core) {
    if (!b.words.core.has(w)) continue;
    sharedWords++;
    if ((a.names.counts.has(w) || b.names.counts.has(w)) && !isRare(w)) sharedCommonNames++;
  }
  if (needed === 0 || sharedWords < needed) return -1;
  // Sharing only widely used names ("AWS", "Amazon") is weak evidence: two
  // AWS launches aren't one story. Require a third shared name then, which
  // a real story ("Jensen", "Huang", "Nvidia") easily has.
  if (sharedWords === sharedCommonNames && sharedWords < opt.minSharedTitleWords + 1) return -1;

  // Any shared name avoids the "names different things" penalty (a name can
  // be common precisely because one story dominates the day), but only rare
  // names earn the bonus.
  let shared = 0;
  let sharedRare = 0;
  for (const e of a.names.core) {
    if (!b.names.core.has(e)) continue;
    shared++;
    if (isRare(e)) sharedRare++;
  }
  const disjoint = shared === 0 && a.names.core.size > 0 && b.names.core.size > 0;

  const score = cosine(a.centroid, b.centroid) + Math.min(sharedRare, 2) * opt.entityBoost;
  const bareHeadline = !(a.hasSummary && b.hasSummary);
  const bar = (disjoint ? opt.disjointEntityThreshold : opt.threshold) + (bareHeadline ? opt.bareHeadlinePenalty : 0);
  return score >= bar ? score : -1;
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
