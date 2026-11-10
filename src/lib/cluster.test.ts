import { describe, expect, it } from "vitest";
import type { Article, SourceId } from "./types";
import { clusterArticles } from "./cluster";
import { canonicalUrl } from "./url";

const H = 3600_000;
let n = 0;
function art(p: Partial<Article> & { title: string; source?: SourceId }): Article {
  n++;
  const source = p.source ?? "currents";
  return {
    id: `${source}:${n}`,
    source,
    description: "",
    url: `https://outlet${n}.example/story-${n}`,
    outlet: source === "hn" ? "Hacker News" : `outlet${n}.example`,
    publishedAt: 0,
    ...p,
  };
}

const titles = (groups: Article[][]) =>
  groups.map((g) => g.map((a) => a.title).sort()).sort((a, b) => a[0].localeCompare(b[0]));

describe("canonicalUrl", () => {
  it("ignores scheme, www, trailing slash, fragments and tracking params", () => {
    expect(canonicalUrl("https://www.Example.com/a/b/?utm_source=x&id=2#top")).toBe(
      canonicalUrl("http://example.com/a/b?id=2"),
    );
  });
  it("keeps meaningful query params distinct", () => {
    expect(canonicalUrl("https://x.com/p?id=1")).not.toBe(canonicalUrl("https://x.com/p?id=2"));
  });
});

describe("clusterArticles", () => {
  it("groups articles that share a canonical URL even with unrelated titles", () => {
    const a = art({ title: "Claude Fable 5.2 and Mythos 5.2", url: "https://www.anthropic.com/news/fable" , source: "hn"});
    const b = art({ title: "Anthropic ships new models", url: "https://anthropic.com/news/fable/?utm_source=hn" });
    const c = art({ title: "Raspberry Pi 5 16GB price climbs again" });
    expect(titles(clusterArticles([a, b, c]))).toEqual([
      ["Anthropic ships new models", "Claude Fable 5.2 and Mythos 5.2"],
      ["Raspberry Pi 5 16GB price climbs again"],
    ]);
  });

  it("groups differently worded headlines about the same event", () => {
    const groups = clusterArticles([
      art({ title: "Anthropic releases Claude Fable 5.2, its most capable model yet", source: "hn" }),
      art({ title: "Anthropic unveils Claude Fable 5.2 model with stronger coding" }),
      art({ title: "Claude Fable 5.2: Anthropic's new model tops benchmarks" }),
      art({ title: "Canada launches Real-Time Rail payment system" }),
      art({ title: "Payments Canada switches on Real-Time Rail for instant payments" }),
      art({ title: "What is malloc doing, anyway?", source: "hn" }),
    ]);
    expect(groups.map((g) => g.length).sort()).toEqual([1, 2, 3]);
  });

  it("does not merge stories that only share generic words", () => {
    const groups = clusterArticles([
      art({ title: "Google announces new AI model for search" }),
      art({ title: "Meta announces new AI model for ads" }),
      art({ title: "Apple announces new iPad lineup" }),
    ]);
    expect(groups).toHaveLength(3);
  });

  it("keeps GridNews event members together", () => {
    const e = { eventId: "ev1", independentVoices: 2 };
    const groups = clusterArticles([
      art({ title: "Nvidia beats estimates on data-center demand", source: "gridnews", gridnews: { ...e, voiceKey: "a" } }),
      art({ title: "Chipmaker posts record quarter", source: "gridnews", gridnews: { ...e, voiceKey: "b" } }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("does not chain unrelated stories through a bridging headline", () => {
    const groups = clusterArticles([
      art({ title: "OpenAI launches GPT browser agent for enterprise" }),
      art({ title: "OpenAI browser agent arrives as Microsoft Edge adds AI" }),
      art({ title: "Microsoft Edge adds AI tab grouping and new themes" }),
    ]);
    // The middle headline may join one side, but the two ends must not merge.
    const withEnds = groups.find((g) => g.some((a) => a.title.startsWith("OpenAI launches")))!;
    expect(withEnds.some((a) => a.title.startsWith("Microsoft Edge adds"))).toBe(false);
  });
});

export { art, H };
