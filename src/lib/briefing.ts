import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { HOUR_MS, type Article, type Briefing, type SourceId, type SourceState } from "./types";
import { clusterArticles } from "./cluster";
import { rankClusters, toCluster } from "./rank";
import { SOURCES, type SourceDef } from "./sources/registry";

export const WINDOW_HOURS = 24;
export const TOP_SIZE = 10;

export type DataMode = "fixtures" | "live";

export function dataMode(): DataMode {
  const m = process.env.DATA_MODE;
  if (m === "fixtures" || m === "live") return m;
  return process.env.NODE_ENV === "production" ? "live" : "fixtures";
}

/** Sources whose data can appear in this build (and so need attribution). */
export function activeSources(): SourceDef[] {
  if (dataMode() === "fixtures") return SOURCES;
  return SOURCES.filter((s) => s.skipLive?.(process.env) == null);
}

/** What a source step produced: raw API data, or a reason to skip it. */
type Fetched = { kind: "data"; raw: unknown; synthetic: boolean } | { kind: "skip"; state: SourceState };

interface Loaded {
  articles: Article[];
  state: SourceState;
  synthetic: boolean;
}

const FIXTURES = path.join(process.cwd(), "fixtures");

/** Real snapshot if present, otherwise the synthetic sample. */
function fromFixture(name: string): Fetched {
  for (const file of [`${name}.json`, `${name}.sample.json`]) {
    const p = path.join(FIXTURES, file);
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, "utf8")) as { synthetic?: boolean };
      return { kind: "data", raw, synthetic: raw.synthetic === true };
    }
  }
  return {
    kind: "skip",
    state: { status: "disabled", reason: `no fixtures/${name}.json (run npm run fixtures:refresh)` },
  };
}

async function loadSource(src: SourceDef, now: number, live: boolean): Promise<Loaded> {
  try {
    let fetched: Fetched;
    if (!live) fetched = fromFixture(src.fixture);
    else {
      const skipState = src.skipLive?.(process.env) ?? null;
      fetched = skipState
        ? { kind: "skip", state: skipState }
        : { kind: "data", raw: await src.fetch(now, WINDOW_HOURS, process.env), synthetic: false };
    }
    if (fetched.kind === "skip") return { articles: [], state: fetched.state, synthetic: false };
    const articles = src.parse(fetched.raw);
    return { articles, state: { status: "ok", count: articles.length }, synthetic: fetched.synthetic };
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
  const results = await Promise.all(SOURCES.map((s) => loadSource(s, now, live)));
  const loaded = Object.fromEntries(SOURCES.map((s, i) => [s.id, results[i]])) as Record<SourceId, Loaded>;

  if (!results.some((l) => l.state.status === "ok")) {
    // Fail the build so the previously published edition stays online.
    const why = SOURCES.map((s) => `${s.id}: ${describeState(loaded[s.id].state) ?? loaded[s.id].state.status}`).join(
      "; ",
    );
    throw new Error(`No news source returned data (${why})`);
  }

  let articles = results.flatMap((l) => l.articles);
  // Fixture snapshots are old, so measure their window from the newest article.
  const reference = live || articles.length === 0 ? now : Math.max(...articles.map((a) => a.publishedAt));
  articles = articles.filter(
    (a) => a.publishedAt >= reference - WINDOW_HOURS * HOUR_MS && a.publishedAt <= reference + HOUR_MS,
  );

  const clusters = clusterArticles(articles).map(toCluster);
  const { top, alsoTrending } = rankClusters(clusters, TOP_SIZE);

  return {
    generatedAt: reference,
    windowHours: WINDOW_HOURS,
    top,
    alsoTrending,
    sourceStates: Object.fromEntries(SOURCES.map((s) => [s.id, loaded[s.id].state])) as Record<SourceId, SourceState>,
    usesSampleData: results.some((l) => l.synthetic),
  };
}
