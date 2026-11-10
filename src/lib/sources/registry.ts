import { SOURCE_IDS, type Article, type SourceId, type SourceState } from "../types";
import type { ColumnOrder } from "../rank";
import { fetchHn, parseHn, type AlgoliaResponse } from "./hn";
import { fetchSonto, parseSonto, type SontoResponse } from "./sonto";
import { fetchSpaceflight, parseSpaceflight, type SpaceflightResponse } from "./spaceflight";
import { fetchDeployLog, parseDeployLog, type DeployLogResponse } from "./deploylog";
import { fetchKiwi, parseKiwi, type KiwiResponse } from "./kiwi";
import { fetchGridnews, parseGridnews, type GridEventsResponse } from "./gridnews";

/**
 * Everything the app needs to know about one news source, in one place.
 * Adding a source: write its adapter, add its id to SOURCE_IDS (types.ts),
 * and add its entry below (tsc fails until you do).
 */
export interface SourceDef<Raw = unknown> {
  id: SourceId;
  /** Display name, e.g. "Hacker News". */
  label: string;
  /** Short name for the mobile tab. */
  tabLabel: string;
  /** Heading of its desktop column of single-outlet stories. */
  columnTitle: string;
  /** One sentence for the About page. */
  about: string;
  attribution: {
    name: string;
    url: string;
    license?: { name: string; url: string };
    /** Required by some licences (CC BY): what we changed. */
    changes?: string;
  };
  /** Base name of ./fixtures/<name>.json (or .sample.json). */
  fixture: string;
  /** Order of its "Also" column. */
  columnOrder: ColumnOrder;
  /** Env var holding the API key, for sources that need one. */
  requiresKey?: string;
  /** Env var that must be "true" in production (feature flag). */
  flag?: string;
  fetch: (now: number, windowHours: number, env: NodeJS.ProcessEnv) => Promise<Raw>;
  parse: (raw: Raw) => Article[];
}

/** Keeps each entry's raw type checked against its own parser. */
const define = <Raw,>(def: SourceDef<Raw>): SourceDef => def as unknown as SourceDef;

const DEFS: Record<SourceId, SourceDef> = {
  hn: define<AlgoliaResponse>({
    id: "hn",
    label: "Hacker News",
    tabLabel: "HN",
    columnTitle: "Also on Hacker News",
    about:
      "stories from the last 24 hours with more than 20 points, via the Algolia HN Search API. It is the developer signal: community sharing counts as one voice per story, however many times it is posted.",
    attribution: { name: "Algolia HN Search API", url: "https://hn.algolia.com/api" },
    fixture: "hn",
    columnOrder: "points",
    fetch: (now, hours) => fetchHn(now, hours),
    parse: parseHn,
  }),
  sonto: define<SontoResponse>({
    id: "sonto",
    label: "Sonto",
    tabLabel: "Tech & AI",
    columnTitle: "Also in tech & AI news",
    about:
      "tech and AI articles from about 40 outlets such as TechCrunch, Wired, The Verge, Bloomberg and Techmeme, each counted under its own website. Link-sharing feeds in it (Lobsters, LAXIMA AI Signal) count as community posts, and its copies of Hacker News are left out.",
    attribution: { name: "Sonto", url: "https://sonto.tech" },
    fixture: "sonto",
    columnOrder: "recent",
    fetch: (now, hours) => fetchSonto(now, hours),
    parse: parseSonto,
  }),
  spaceflight: define<SpaceflightResponse>({
    id: "spaceflight",
    label: "Spaceflight News",
    tabLabel: "Space",
    columnTitle: "Also in space news",
    about: "space news from outlets such as NASA, SpaceNews and Ars Technica.",
    attribution: { name: "Spaceflight News API", url: "https://spaceflightnewsapi.net" },
    fixture: "spaceflight",
    columnOrder: "recent",
    fetch: (now, hours) => fetchSpaceflight(now, hours),
    parse: parseSpaceflight,
  }),
  deploylog: define<DeployLogResponse>({
    id: "deploylog",
    label: "The Deploy Log",
    tabLabel: "AI releases",
    columnTitle: "Also shipped in AI",
    about:
      "AI product and model releases, each linked to the company's own announcement. All the release notes in one story count as one voice together.",
    attribution: {
      name: "The Deploy Log (deployedbyai)",
      url: "https://deployedbyai.com/log/",
      license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
      changes: "entries shortened and regrouped by story",
    },
    fixture: "deploylog",
    columnOrder: "recent",
    fetch: (now, hours) => fetchDeployLog(now, hours),
    parse: parseDeployLog,
  }),
  kiwi: define<KiwiResponse>({
    id: "kiwi",
    label: "Kiwi News",
    tabLabel: "Kiwi",
    columnTitle: "Also on Kiwi News",
    about:
      "the latest 25 community-shared links, mostly about crypto and Ethereum. Like Hacker News, its posts are community voices.",
    attribution: { name: "Kiwi News", url: "https://news.kiwistand.com" },
    fixture: "kiwi",
    columnOrder: "recent",
    fetch: () => fetchKiwi(),
    parse: parseKiwi,
  }),
  gridnews: define<GridEventsResponse>({
    id: "gridnews",
    label: "GridNews",
    tabLabel: "Markets",
    columnTitle: "Markets",
    about: "market news about technology companies, already grouped by story. It needs an API key.",
    attribution: { name: "GridNews", url: "https://www.gridnews.io" },
    fixture: "gridnews",
    columnOrder: "coverage",
    requiresKey: "GRIDNEWS_API_KEY",
    flag: "GRIDNEWS_ENABLED",
    fetch: (_now, hours, env) => fetchGridnews(env.GRIDNEWS_API_KEY!, hours),
    parse: parseGridnews,
  }),
};

export const SOURCES: SourceDef[] = SOURCE_IDS.map((id) => DEFS[id]);
export const SOURCE_BY_ID = DEFS;

/**
 * Why a source can't be fetched live, or null if it can. One rule shared
 * by the build (`checkFlag` true) and the fixture refresh script (false:
 * development data ignores feature flags but still needs keys).
 */
export function liveSkipReason(src: SourceDef, env: NodeJS.ProcessEnv, checkFlag = true): SourceState | null {
  if (checkFlag && src.flag && env[src.flag] !== "true") return { status: "disabled", reason: "switched off", quiet: true };
  if (src.requiresKey && !env[src.requiresKey]) return { status: "disabled", reason: `no ${src.requiresKey} is configured` };
  return null;
}
