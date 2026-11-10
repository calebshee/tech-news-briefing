import { describe, expect, it } from "vitest";
import hnFixture from "../../../fixtures/hn.json";
import sontoFixture from "../../../fixtures/sonto.json";
import spaceflightFixture from "../../../fixtures/spaceflight.json";
import deploylogFixture from "../../../fixtures/deploylog.json";
import kiwiFixture from "../../../fixtures/kiwi.json";
import gridSample from "../../../fixtures/gridnews.sample.json";
import { parseHn, type AlgoliaResponse } from "./hn";
import { fullTitle, parseSonto, parseSontoDate, type SontoResponse } from "./sonto";
import { parseSpaceflight, type SpaceflightResponse } from "./spaceflight";
import { parseDeployLog, shippedAt, type DeployLogResponse } from "./deploylog";
import { parseKiwi, type KiwiResponse } from "./kiwi";
import { parseGridnews, type GridEventsResponse } from "./gridnews";
import { SOURCES } from "./registry";
import type { Article } from "../types";

function wellFormed(articles: Article[]) {
  expect(articles.length).toBeGreaterThan(0);
  for (const a of articles) {
    expect(a.title.length).toBeGreaterThan(0);
    expect(a.url).toMatch(/^https?:\/\//);
    expect(a.outlet.length).toBeGreaterThan(0);
    expect(a.publishedAt).toBeGreaterThan(Date.parse("2020-01-01"));
  }
}

describe("every registered source", () => {
  it("has a unique id and fixture", () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    expect(new Set(SOURCES.map((s) => s.fixture)).size).toBe(SOURCES.length);
  });
});

describe("parseHn", () => {
  const articles = parseHn(hnFixture as AlgoliaResponse);
  it("normalises every titled hit with HN as the outlet", () => {
    wellFormed(articles);
    expect(articles.every((a) => a.outlet === "Hacker News" && a.hn)).toBe(true);
  });
  it("links self-posts to their discussion", () => {
    const self = parseHn({ hits: [{ objectID: "9", title: "Ask HN: x", url: null, points: 3, num_comments: 1, created_at_i: 1 }] });
    expect(self[0].url).toBe("https://news.ycombinator.com/item?id=9");
  });
});

describe("parseSonto", () => {
  it("reads the real snapshot with each article under its original outlet", () => {
    const articles = parseSonto(sontoFixture as SontoResponse);
    wellFormed(articles);
    expect(new Set(articles.map((a) => a.outlet)).size).toBeGreaterThan(5);
  });
  it("treats Sonto's timezone-less dates as UTC", () => {
    expect(parseSontoDate("2026-11-10T05:40:02")).toBe(Date.parse("2026-11-10T05:40:02Z"));
  });
  it("drops its copies of Hacker News, future-dated items and duplicates", () => {
    const item = (title: string, source: string, date: string, link = `https://x.example/${title}`) => ({
      title,
      link,
      source,
      date,
    });
    const articles = parseSonto({
      lastUpdated: "2026-11-10T06:00:00Z",
      items: [
        item("kept", "Wired", "2026-11-10T05:00:00"),
        item("dupe", "Wired", "2026-11-10T05:00:00", "https://x.example/kept"),
        item("hn copy", "Hacker News", "2026-11-10T05:00:00"),
        item("hn best", "HN Best", "2026-11-10T05:00:00"),
        item("future", "Wired", "2026-11-30T05:00:00"),
      ],
    });
    expect(articles.map((a) => a.title)).toEqual(["kept"]);
  });
});

describe("parseSpaceflight", () => {
  it("uses the news site as the outlet", () => {
    const articles = parseSpaceflight(spaceflightFixture as SpaceflightResponse);
    wellFormed(articles);
  });
});

describe("parseDeployLog", () => {
  it("reads the real snapshot with the company as the outlet", () => {
    wellFormed(parseDeployLog(deploylogFixture as DeployLogResponse));
  });
  it("keeps the subject as the title and the company as the outlet", () => {
    const [a] = parseDeployLog({
      rows: [
        {
          row_key: "k",
          company: "Google Cloud",
          subject: "TPU Sync",
          what_shipped: null,
          source_url: "https://cloud.google.example/tpu-sync",
          published_date: "2026-11-10",
          added_at: "2026-11-10T00:00:00Z",
        },
      ],
    });
    expect(a.title).toBe("TPU Sync");
    expect(a.outlet).toBe("Google Cloud");
  });
});

describe("shippedAt", () => {
  it("uses the logging time when logged on the publication day", () => {
    expect(shippedAt({ published_date: "2026-11-10", added_at: "2026-11-10T09:00:00Z" })).toBe(
      Date.parse("2026-11-10T09:00:00Z"),
    );
  });
  it("doesn't let a release logged days late look fresh", () => {
    expect(shippedAt({ published_date: "2026-11-05", added_at: "2026-11-10T09:00:00Z" })).toBe(
      Date.parse("2026-11-05T12:00:00Z"),
    );
  });
  it("falls back to the logging time without a publication day", () => {
    expect(shippedAt({ published_date: null, added_at: "2026-11-10T09:00:00Z" })).toBe(
      Date.parse("2026-11-10T09:00:00Z"),
    );
  });
});

describe("Sonto titles and outlets", () => {
  it("recovers a Techmeme headline Sonto cut at 120 characters", () => {
    const cut =
      "The White House picks Palantir CISO Michael LoSapio to lead the DHS' Cybersecurity and Infrastructure Security Agency, r";
    const desc =
      "Reuters: The White House picks Palantir CISO Michael LoSapio to lead the DHS' Cybersecurity and Infrastructure Security Agency, replacing Acting Director Nick Andersen — The White House said on Monday";
    expect(fullTitle(cut, desc)).toBe(
      "The White House picks Palantir CISO Michael LoSapio to lead the DHS' Cybersecurity and Infrastructure Security Agency, replacing Acting Director Nick Andersen",
    );
  });
  it("leaves normal titles alone", () => {
    expect(fullTitle("Short title", "Something else: entirely")).toBe("Short title");
  });
  it("counts press by website and link-sharing feeds as community", () => {
    const articles = parseSonto({
      lastUpdated: "2026-11-10T06:00:00Z",
      items: [
        { title: "A", link: "https://www.bloomberg.com/a", source: "Bloomberg Tech", date: "2026-11-10T05:00:00" },
        { title: "B", link: "https://www.bloomberg.com/b", source: "Bloomberg Economics", date: "2026-11-10T05:00:00" },
        { title: "C", link: "https://blog.example/c", source: "Lobsters", date: "2026-11-10T05:00:00" },
      ],
    });
    expect(articles.map((a) => [a.outlet, a.kind])).toEqual([
      ["bloomberg.com", "press"],
      ["bloomberg.com", "press"],
      ["Lobsters", "community"],
    ]);
  });
});

describe("parseKiwi", () => {
  it("counts Kiwi News as one community outlet", () => {
    const articles = parseKiwi(kiwiFixture as KiwiResponse);
    wellFormed(articles);
    expect(articles.every((a) => a.outlet === "Kiwi News")).toBe(true);
  });
});

describe("parseGridnews", () => {
  it("keeps only technology events and turns members into articles", () => {
    const a = parseGridnews(gridSample as unknown as GridEventsResponse);
    expect(a).toHaveLength(3); // the Financials-only event is dropped
    expect(new Set(a.map((x) => x.gridnews!.eventId))).toEqual(new Set(["sample-ev-1"]));
  });
});
