import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Article, Briefing, SourceId, SourceState } from "./types";
import { clusterArticles } from "./cluster";
import { rankClusters, toCluster } from "./rank";
import { fetchHn, parseHn, type AlgoliaResponse } from "./sources/hn";
import { fetchCurrents, parseCurrents, type CurrentsResponse } from "./sources/currents";
import { fetchGridnews, parseGridnews, type GridEventsResponse } from "./sources/gridnews";

export const WINDOW_HOURS = 24;
export const TOP_SIZE = 10;

export type DataMode = "fixtures" | "live";

export function dataMode(): DataMode {
  const m = process.env.DATA_MODE;
  if (m === "fixtures" || m === "live") return m;
  return process.env.NODE_ENV === "production" ? "live" : "fixtures";
}

interface Loaded {
  articles: Article[];
  state: SourceState;
  synthetic: boolean;
}

const FIXTURES = path.join(process.cwd(), "fixtures");

/** Real snapshot if present, otherwise the synthetic sample. */
function readFixture<T>(name: string): { data: T; synthetic: boolean } | null {
  for (const file of [`${name}.json`, `${name}.sample.json`]) {
    const p = path.join(FIXTURES, file);
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, "utf8")) as T & { synthetic?: boolean };
      return { data, synthetic: data.synthetic === true };
    }
  }
  return null;
}

async function load<T>(
  run: () => Promise<{ raw: T; synthetic: boolean } | SourceState>,
  parse: (raw: T) => Article[],
): Promise<Loaded> {
  try {
    const r = await run();
    if ("status" in r && (r.status === "disabled" || r.status === "error")) {
      return { articles: [], state: r, synthetic: false };
    }
    const { raw, synthetic } = r as { raw: T; synthetic: boolean };
    const articles = parse(raw);
    return { articles, state: { status: "ok", count: articles.length }, synthetic };
  } catch (e) {
    return { articles: [], state: { status: "error", message: (e as Error).message }, synthetic: false };
  }
}

function fromFixture<T>(name: string): { raw: T; synthetic: boolean } | SourceState {
  const f = readFixture<T>(name);
  return f
    ? { raw: f.data, synthetic: f.synthetic }
    : { status: "disabled", reason: `No fixtures/${name}.json — run npm run fixtures:refresh` };
}

export async function buildBriefing(now = Date.now(), mode: DataMode = dataMode()): Promise<Briefing> {
  const live = mode === "live";
  const currentsKey = process.env.CURRENTS_API_KEY;
  const gridKey = process.env.GRIDNEWS_API_KEY;
  const gridEnabled = process.env.GRIDNEWS_ENABLED === "true";

  const [hn, currents, gridnews] = await Promise.all([
    load<AlgoliaResponse>(
      async () => (live ? { raw: await fetchHn(now, WINDOW_HOURS), synthetic: false } : fromFixture("hn")),
      parseHn,
    ),
    load<CurrentsResponse>(async () => {
      if (!live) return fromFixture("currents");
      if (!currentsKey) return { status: "disabled", reason: "No CURRENTS_API_KEY configured" };
      return { raw: await fetchCurrents(currentsKey, now, WINDOW_HOURS), synthetic: false };
    }, parseCurrents),
    load<GridEventsResponse>(async () => {
      if (!live) return fromFixture("gridnews");
      if (!gridEnabled) return { status: "disabled", reason: "Off until GridNews confirms public display" };
      if (!gridKey) return { status: "disabled", reason: "No GRIDNEWS_API_KEY configured" };
      return { raw: await fetchGridnews(gridKey, WINDOW_HOURS), synthetic: false };
    }, parseGridnews),
  ]);

  const loaded: Record<SourceId, Loaded> = { hn, currents, gridnews };
  if (!Object.values(loaded).some((l) => l.state.status === "ok")) {
    // Fail the build so the previously published page stays up.
    const why = Object.entries(loaded)
      .map(([s, l]) => `${s}: ${l.state.status === "error" ? l.state.message : l.state.status}`)
      .join("; ");
    throw new Error(`No news source returned data (${why})`);
  }

  let articles = Object.values(loaded).flatMap((l) => l.articles);
  // Fixture snapshots are old; measure the window from the newest article.
  const reference = live ? now : Math.max(...articles.map((a) => a.publishedAt));
  articles = articles.filter((a) => a.publishedAt >= reference - WINDOW_HOURS * 3600_000);

  const clusters = clusterArticles(articles).map(toCluster);
  const { top, alsoTrending } = rankClusters(clusters, TOP_SIZE);

  return {
    generatedAt: live ? now : reference,
    windowHours: WINDOW_HOURS,
    top,
    alsoTrending,
    sourceStates: { hn: hn.state, currents: currents.state, gridnews: gridnews.state },
    usesSampleData: Object.values(loaded).some((l) => l.synthetic),
  };
}
