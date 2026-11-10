import { describe, expect, it } from "vitest";
import hnFixture from "../../../fixtures/hn.json";
import currentsSample from "../../../fixtures/currents.sample.json";
import gridSample from "../../../fixtures/gridnews.sample.json";
import { parseHn, type AlgoliaResponse } from "./hn";
import { parseCurrents, parseCurrentsDate, type CurrentsResponse } from "./currents";
import { parseGridnews, type GridEventsResponse } from "./gridnews";

describe("parseHn", () => {
  const articles = parseHn(hnFixture as AlgoliaResponse);
  it("normalises every titled hit with HN as the outlet", () => {
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.every((a) => a.outlet === "Hacker News" && a.hn && a.url)).toBe(true);
  });
  it("links self-posts to their discussion", () => {
    const self = parseHn({ hits: [{ objectID: "9", title: "Ask HN: x", url: null, points: 3, num_comments: 1, created_at_i: 1 }] });
    expect(self[0].url).toBe("https://news.ycombinator.com/item?id=9");
  });
});

describe("parseCurrents", () => {
  it("parses Currents' date format as UTC", () => {
    expect(parseCurrentsDate("2026-11-09 22:10:00 +0000")).toBe(Date.parse("2026-11-09T22:10:00Z"));
  });
  it("uses the article domain as the outlet", () => {
    const a = parseCurrents(currentsSample as CurrentsResponse);
    expect(a[0].outlet).toBe("sample-wire.example");
  });
});

describe("parseGridnews", () => {
  it("keeps only technology events and turns members into articles", () => {
    const a = parseGridnews(gridSample as unknown as GridEventsResponse);
    expect(a).toHaveLength(3); // the Financials-only event is dropped
    expect(new Set(a.map((x) => x.gridnews!.eventId))).toEqual(new Set(["sample-ev-1"]));
  });
});
