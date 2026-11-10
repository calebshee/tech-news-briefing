import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { HOUR_MS, type Article, type Briefing, type SourceId, type SourceState } from "./types";
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

/** Whether GridNews data can appear (and so needs its attribution). */
export function gridnewsShown(): boolean {
  return dataMode() === "fixtures" || process.env.GRIDNEWS_ENABLED === "true";
}

/** What a source step produced: raw API data, or a reason to skip it. */
type Fetched<T> = { kind: "data"; raw: T; synthetic: boolean } | { kind: "skip"; state: SourceState };

interface Loaded {
  articles: Article[];
  state: SourceState;
  synthetic: boolean;
}

const FIXTURES = path.join(process.cwd(), "fixtures");

/** Real snapshot if present, otherwise the synthetic sample. */
function fromFixture<T>(name: string): Fetched<T> {
  for (const file of [`${name}.json`, `${name}.sample.json`]) {
    const p = path.join(FIXTURES, file);
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, "utf8")) as T & { synthetic?: boolean };
      return { kind: "data", raw, synthetic: raw.synthetic === true };
    }
  }
  return skip({ status: "disabled", reason: `no fixtures/${name}.json (run npm run fixtures:refresh)` });
}

const skip = (state: SourceState): Fetched<never> => ({ kind: "skip", state });

async function load<T>(fetchStep: () => Promise<Fetched<T>>, parse: (raw: T) => Article[]): Promise<Loaded> {
  try {
    const r = await fetchStep();
    if (r.kind === "skip") return { articles: [], state: r.state, synthetic: false };
    const articles = parse(r.raw);
    return { articles, state: { status: "ok", count: articles.length }, synthetic: r.synthetic };
  } catch (e) {
    return { articles: [], state: { status: "error", message: (e as Error).message }, synthetic: false };
  }
}

/** Reader-facing reason a source is missing from an edition, or null. */
export function describeState(state: SourceState): string | null {
  if (state.status === "error") return `the request failed (${state.message})`;
  if (state.status === "disabled" && !state.quiet) return state.reason;
  return null;
}

export async function buildBriefing(now = Date.now(), mode: DataMode = dataMode()): Promise<Briefing> {
  const live = mode === "live";
  const currentsKey = process.env.CURRENTS_API_KEY;
  const gridKey = process.env.GRIDNEWS_API_KEY;

  const [hn, currents, gridnews] = await Promise.all([
    load<AlgoliaResponse>(async () => {
      if (!live) return fromFixture("hn");
      return { kind: "data", raw: await fetchHn(now, WINDOW_HOURS), synthetic: false };
    }, parseHn),
    load<CurrentsResponse>(async () => {
      if (!live) return fromFixture("currents");
      if (!currentsKey) return skip({ status: "disabled", reason: "no CURRENTS_API_KEY is configured" });
      return { kind: "data", raw: await fetchCurrents(currentsKey, now, WINDOW_HOURS), synthetic: false };
    }, parseCurrents),
    load<GridEventsResponse>(async () => {
      if (!live) return fromFixture("gridnews");
      if (process.env.GRIDNEWS_ENABLED !== "true")
        return skip({ status: "disabled", reason: "switched off", quiet: true });
      if (!gridKey) return skip({ status: "disabled", reason: "no GRIDNEWS_API_KEY is configured" });
      return { kind: "data", raw: await fetchGridnews(gridKey, WINDOW_HOURS), synthetic: false };
    }, parseGridnews),
  ]);

  const loaded: Record<SourceId, Loaded> = { hn, currents, gridnews };
  if (!Object.values(loaded).some((l) => l.state.status === "ok")) {
    // Fail the build so the previously published edition stays online.
    const why = Object.entries(loaded)
      .map(([s, l]) => `${s}: ${describeState(l.state) ?? l.state.status}`)
      .join("; ");
    throw new Error(`No news source returned data (${why})`);
  }

  let articles = Object.values(loaded).flatMap((l) => l.articles);
  // Fixture snapshots are old, so measure their window from the newest article.
  const reference = live || articles.length === 0 ? now : Math.max(...articles.map((a) => a.publishedAt));
  articles = articles.filter((a) => a.publishedAt >= reference - WINDOW_HOURS * HOUR_MS);

  const clusters = clusterArticles(articles).map(toCluster);
  const { top, alsoTrending } = rankClusters(clusters, TOP_SIZE);

  return {
    generatedAt: reference,
    windowHours: WINDOW_HOURS,
    top,
    alsoTrending,
    sourceStates: { hn: hn.state, currents: currents.state, gridnews: gridnews.state },
    usesSampleData: Object.values(loaded).some((l) => l.synthetic),
  };
}
