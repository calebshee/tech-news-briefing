import { describe, expect, it } from "vitest";
import type { Article, SourceId } from "./types";
import { coverageOf, toCluster, rankClusters } from "./rank";

const H = 3600_000;
let n = 0;
function art(p: Partial<Article> & { title?: string; source?: SourceId }): Article {
  n++;
  const source = p.source ?? "currents";
  return {
    id: `${source}:${n}`,
    source,
    title: `Story ${n}`,
    description: "",
    url: `https://outlet${n}.example/s`,
    outlet: source === "hn" ? "Hacker News" : `outlet${n}.example`,
    publishedAt: 0,
    ...p,
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
});

describe("toCluster", () => {
  it("prefers a mainstream headline and reports who was first and by how much", () => {
    const c = toCluster([
      hn(300, { title: "Show HN thing", publishedAt: 0 }),
      art({ title: "Mainstream take", outlet: "reuters.com", publishedAt: 6 * H }),
    ]);
    expect(c.headline).toBe("Mainstream take");
    expect(c.firstSeen.source).toBe("hn");
    expect(c.lead).toEqual({ nextSource: "currents", hours: 6 });
    expect(c.engagement).toBe(300);
    expect(c.sources.sort()).toEqual(["currents", "hn"]);
  });
});

describe("rankClusters", () => {
  it("ranks by coverage, then engagement, and fills the top list with HN-only stories", () => {
    const big = toCluster([art({}), art({}), art({})]);
    const mid = toCluster([art({}), hn(5)]);
    const midHot = toCluster([art({}), hn(500)]);
    const hnOnlyHot = toCluster([hn(900)]);
    const hnOnlyCold = toCluster([hn(30)]);
    const currentsOnly = toCluster([art({})]);
    const { top, alsoTrending } = rankClusters([hnOnlyCold, mid, currentsOnly, big, hnOnlyHot, midHot], 4);
    expect(top.map((c) => c.id)).toEqual([big.id, midHot.id, mid.id, hnOnlyHot.id]);
    expect(top[3].fill).toBe(true);
    expect(top[0].fill).toBe(false);
    expect(alsoTrending.hn.map((c) => c.id)).toEqual([hnOnlyCold.id]);
    expect(alsoTrending.currents.map((c) => c.id)).toEqual([currentsOnly.id]);
  });

  it("shows only real clusters when there are enough", () => {
    const clusters = Array.from({ length: 12 }, () => toCluster([art({}), art({})]));
    const { top } = rankClusters([...clusters, toCluster([hn(999)])], 10);
    expect(top).toHaveLength(10);
    expect(top.every((c) => !c.fill)).toBe(true);
  });
});
