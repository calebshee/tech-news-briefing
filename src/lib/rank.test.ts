import { describe, expect, it } from "vitest";
import type { Article, ArticleKind, SourceId } from "./types";

const KIND: Record<SourceId, ArticleKind> = { hn: "community", kiwi: "community", deploylog: "release", gridnews: "markets", sonto: "press", spaceflight: "press" };
import { coverageOf, toCluster, rankClusters } from "./rank";

const H = 3600_000;
let n = 0;
function art(p: Partial<Article> & { title?: string; source?: SourceId }): Article {
  n++;
  const source = p.source ?? "sonto";
  return {
    id: `${source}:${n}`,
    source,
    title: `Story ${n}`,
    description: "",
    url: `https://outlet${n}.example/s`,
    outlet: source === "hn" ? "Hacker News" : `outlet${n}.example`,
    publishedAt: 0,
    ...p,
    kind: p.kind ?? KIND[source],
  };
}
const hn = (points: number, p: Partial<Article> = {}) =>
  art({ source: "hn", hn: { points, comments: 0, discussionUrl: "https://news.ycombinator.com/item?id=1" }, ...p });

describe("coverageOf", () => {
  it("counts distinct outlets", () => {
    expect(coverageOf([art({ outlet: "a.com" }), art({ outlet: "b.com" }), art({ outlet: "a.com" })])).toBe(2);
  });
  it("collapses wire reprints (same headline at different outlets)", () => {
    const t = "Fed holds rates steady, signals patience";
    expect(coverageOf([art({ outlet: "a.com", title: t }), art({ outlet: "b.com", title: t + "." }), art({ outlet: "c.com" })])).toBe(2);
  });
  it("collapses outlets GridNews marks with the same voiceKey", () => {
    const g = (outlet: string, voiceKey: string) =>
      art({ source: "gridnews", outlet, gridnews: { eventId: "e", voiceKey, independentVoices: 2 } });
    expect(coverageOf([g("a.com", "ap"), g("b.com", "ap"), g("c.com", "c")])).toBe(2);
  });
  it("counts Hacker News as one outlet however many HN posts", () => {
    expect(coverageOf([hn(10), hn(20)])).toBe(1);
  });
  it("never merges Hacker News into the outlet whose headline it reuses", () => {
    const t = "Claude Fable 5.2 and Mythos 5.2";
    expect(coverageOf([hn(900, { title: t }), art({ outlet: "anthropic.com", title: t })])).toBe(2);
  });
  it("adds GridNews independent voices missing from the outlet preview", () => {
    const g = (outlet: string, voiceKey: string) =>
      art({ source: "gridnews", outlet, gridnews: { eventId: "e", voiceKey, independentVoices: 5 } });
    // Preview lists 2 voices of 5; plus one news outlet not in the event.
    expect(coverageOf([g("a.com", "a"), g("b.com", "b"), art({ outlet: "c.com" })])).toBe(6);
  });
  it("counts all community echoes of a link as one voice", () => {
    const lobsters = art({ source: "sonto", kind: "community", outlet: "Lobsters" });
    const kiwi = art({ source: "kiwi", outlet: "Kiwi News" });
    expect(coverageOf([hn(300), lobsters, kiwi])).toBe(1);
    expect(toCluster([hn(300), lobsters, kiwi]).communityOnly).toBe(true);
  });
  it("counts all vendor release notes as one voice", () => {
    const rel = (outlet: string) => art({ source: "deploylog", outlet });
    expect(coverageOf([rel("Vercel"), rel("Amazon Web Services"), rel("OpenRouter"), art({ outlet: "techcrunch.com" })])).toBe(2);
  });
});

describe("toCluster", () => {
  it("prefers a mainstream headline and reports who was first and by how much", () => {
    const c = toCluster([
      hn(300, { title: "Show HN thing", publishedAt: 0 }),
      art({ title: "Mainstream take", outlet: "reuters.com", publishedAt: 6 * H }),
    ]);
    expect(c.headline).toBe("Mainstream take");
    expect(c.firstSeen.source).toBe("hn");
    expect(c.lead).toEqual({ nextSource: "sonto", hours: 6 });
    expect(c.engagement).toBe(300);
    expect(c.sources.sort()).toEqual(["hn", "sonto"]);
  });
  it("takes the headline from press before release notes", () => {
    const c = toCluster([
      art({ source: "deploylog", outlet: "Vercel", title: "Muse Ember on AI Gateway", publishedAt: 0 }),
      art({ title: "Meta releases Muse Ember, its smallest model", outlet: "techmeme.com", publishedAt: H }),
    ]);
    expect(c.headline).toBe("Meta releases Muse Ember, its smallest model");
  });
});

describe("rankClusters", () => {
  it("ranks by coverage, then engagement, and fills the top list with HN-only stories", () => {
    const big = toCluster([art({}), art({}), art({})]);
    const mid = toCluster([art({}), hn(5)]);
    const midHot = toCluster([art({}), hn(500)]);
    const hnOnlyHot = toCluster([hn(900)]);
    const hnOnlyCold = toCluster([hn(30)]);
    const newsOnly = toCluster([art({})]);
    const { top, alsoTrending } = rankClusters([hnOnlyCold, mid, newsOnly, big, hnOnlyHot, midHot], 4);
    expect(top.map((c) => c.id)).toEqual([big.id, midHot.id, mid.id, hnOnlyHot.id]);
    expect(top[3].fill).toBe(true);
    expect(top[0].fill).toBe(false);
    expect(alsoTrending.hn.map((c) => c.id)).toEqual([hnOnlyCold.id]);
    expect(alsoTrending.sonto.map((c) => c.id)).toEqual([newsOnly.id]);
  });

  it("tops up with the highest-point HN stories, not the most-commented", () => {
    const pointy = toCluster([art({ source: "hn", hn: { points: 500, comments: 0, discussionUrl: "x" } })]);
    const chatty = toCluster([art({ source: "hn", hn: { points: 100, comments: 900, discussionUrl: "y" } })]);
    const { top } = rankClusters([chatty, pointy], 1);
    expect(top.map((c) => c.id)).toEqual([pointy.id]);
  });

  it("shows only real clusters when there are enough", () => {
    const clusters = Array.from({ length: 12 }, () => toCluster([art({}), art({})]));
    const { top } = rankClusters([...clusters, toCluster([hn(999)])], 10);
    expect(top).toHaveLength(10);
    expect(top.every((c) => !c.fill)).toBe(true);
  });
});
