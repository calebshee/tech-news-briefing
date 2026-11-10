import { describe, expect, it } from "vitest";
import type { Article, ArticleKind, SourceId } from "./types";

const KIND: Record<SourceId, ArticleKind> = { hn: "community", kiwi: "community", deploylog: "release", gridnews: "markets", sonto: "press", spaceflight: "press" };
import { clusterArticles } from "./cluster";
import { canonicalUrl } from "./url";

const H = 3600_000;
let n = 0;
function art(p: Partial<Article> & { title: string; source?: SourceId }): Article {
  n++;
  const source = p.source ?? "sonto";
  return {
    id: `${source}:${n}`,
    source,
    description: "",
    url: `https://outlet${n}.example/story-${n}`,
    outlet: source === "hn" ? "Hacker News" : `outlet${n}.example`,
    publishedAt: 0,
    ...p,
    kind: p.kind ?? KIND[source],
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

  it("matches a one-word headline to a longer one about the same thing", () => {
    const groups = clusterArticles([
      art({ title: "GPT-5", source: "hn" }),
      art({ title: "OpenAI releases GPT-5" }),
      art({ title: "Apple announces new iPad lineup" }),
    ]);
    expect(groups.map((g) => g.length).sort()).toEqual([1, 2]);
  });

  it("keeps accepting coverage as a big story's headlines vary", () => {
    const titles = [
      "Anthropic releases Claude Fable 5.2 and Mythos 5.2",
      "Claude Fable 5.2 scores 65 on Artificial Analysis",
      "Fable 5.2 and Jagged AGI",
      "Anthropic prices Fable 5.2 and Mythos 5.2 at $8 per million tokens",
      "Claude Fable 5.2 launch offers",
      "Claude Fable 5.2 on OpenRouter",
      "Mythos 5.2 formalized a long-open proof, Anthropic says",
    ];
    // A realistic day: the story sits among many unrelated ones.
    const filler = Array.from({ length: 40 }, (_, i) => art({ title: `Unrelated story number ${i} about topic ${i}` }));
    const groups = clusterArticles([...filler, ...titles.map((title) => art({ title }))]);
    expect(Math.max(...groups.map((g) => g.length))).toBeGreaterThanOrEqual(6);
  });

  // Regressions from the 2026-11-10 keyless-source snapshots.
  it("needs three shared words to match a bare HN headline to a press story", () => {
    const press = (title: string) =>
      art({ title, description: "A detailed summary of this particular press story, long enough to count as a summary." });
    const pairs: [string, string][] = [
      ["Italy's Meloni Blames Pro-Russian Hackers for Leak of Foreign Minister's Data", "More than 400k Russians killed fighting in Ukraine war, leaked data suggest"],
      ["Run Linux applications in hypervisor-isolated micro-VMs with Hyperlight", "Ginux: A New Kernel Runs Linux Userspace"],
    ];
    for (const [p, h] of pairs) expect(clusterArticles([press(p), art({ title: h, source: "hn" })])).toHaveLength(2);
    // …while a real match with more shared words still groups.
    expect(
      clusterArticles([
        press("Locating the source of a mysterious beep with Claude"),
        art({ title: "Locating the source of a mysterious beep", source: "hn" }),
      ]),
    ).toHaveLength(1);
  });

  it("doesn't merge words that only share a prefix", () => {
    const groups = clusterArticles([
      art({ title: "CCIA Report Highlights Satellite Connectivity's Potential to Expand Internet Access" }),
      art({ title: "Perhaps Connecting Fridges to the Internet Was a Bad Idea", source: "hn" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("doesn't merge stories that share only widely used names", () => {
    const filler = Array.from({ length: 20 }, (_, i) =>
      art({ title: `AWS and Amazon unrelated launch ${i} for service number ${i}` }),
    );
    const roundup = art({ title: "AWS Weekly Roundup: AgentCore Runtime V2, Amazon DynamoDB bulk put items, and more" });
    const nitro = art({ title: "AWS Nitro Sandboxes on Amazon EKS, ECS and EC2", source: "hn" });
    const groups = clusterArticles([...filler, roundup, nitro]);
    expect(groups.find((g) => g.includes(roundup))!.includes(nitro)).toBe(false);
  });

  it("does not merge launches that share only a platform name", () => {
    const groups = clusterArticles([
      art({ title: "AWS Launches TorchNeuron to Run PyTorch Models on AWS Trainium Without Modifications" }),
      art({ title: "LangSmith BYOC on AWS is generally available" }),
      art({ title: "ChatGPT Enterprise now available in AWS Marketplace" }),
    ]);
    expect(groups).toHaveLength(3);
  });

  it("does not merge headlines that share one ordinary word", () => {
    const groups = clusterArticles([
      art({ title: "What are you doing this week?" }),
      art({ title: "What is malloc doing, anyway?", source: "hn" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps a different product from the same vendor apart", () => {
    const groups = clusterArticles([
      art({ title: "TPU 8tx and TPU 8i Max", source: "hn" }),
      art({ title: "Our newest TPUs: 8tx and 8i Max, built for the agentic era", source: "hn" }),
      art({ source: "deploylog", outlet: "Google Cloud", title: "TPU Sync", description: "open-source C++ library for KV cache transfer on TPU" }),
    ]);
    const sync = groups.find((g) => g.some((a) => a.title === "TPU Sync"))!;
    expect(sync).toHaveLength(1);
  });

  it("still groups a dominant story whose names appear in many headlines", () => {
    const filler = Array.from({ length: 30 }, (_, i) => art({ title: `Unrelated story number ${i} about topic ${i}` }));
    // News articles carry a summary, as Sonto's do.
    const summary = "Nvidia CEO Jensen Huang faces questions over an affair with an alleged spy.";
    const huang = [
      "Jensen Huang pulls out of ElevenLabs Summit amid Nvidia controversy",
      "US Lawmakers Demand Details on Nvidia Amid Jensen Huang Scandal",
      "Everything we know so far about the Nvidia spy scandal targeting CEO Jensen Huang",
      "Nvidia CEO Jensen Huang's Affair With Alleged Spy Raises Succession Concerns",
    ].map((title) => art({ title, description: summary }));
    const groups = clusterArticles([...filler, ...huang]);
    const g = groups.find((x) => x.some((a) => a.title.startsWith("Jensen Huang pulls")))!;
    expect(g.length).toBeGreaterThanOrEqual(3);
  });
});

export { art, H };
