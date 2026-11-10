import type { Article, SourceId, SourceState } from "../types";
import { fetchHn, parseHn, type AlgoliaResponse } from "./hn";
import { fetchSonto, parseSonto, type SontoResponse } from "./sonto";
import { fetchSpaceflight, parseSpaceflight, type SpaceflightResponse } from "./spaceflight";
import { fetchDeployLog, parseDeployLog, type DeployLogResponse } from "./deploylog";
import { fetchKiwi, parseKiwi, type KiwiResponse } from "./kiwi";
import { fetchGridnews, parseGridnews, type GridEventsResponse } from "./gridnews";

/**
 * Everything the app needs to know about one news source, in one place.
 * Adding a source means writing its adapter and adding one entry here.
 */
export interface SourceDef<Raw = unknown> {
  id: SourceId;
  /** Display name, e.g. "Hacker News". */
  label: string;
  /** Short name for the mobile tab. */
  tabLabel: string;
  /** Heading of its desktop column of single-outlet stories. */
  columnTitle: string;
  /**
   * "news": articles from publishers; supplies the preferred headline.
   * "markets": market coverage. "community": link-sharing sites (HN, Kiwi)
   * that count as one outlet each and are never treated as a reprint of
   * the publisher they link to. "releases": vendors' own announcements,
   * whose terse titles make the weakest headline.
   */
  role: "news" | "markets" | "community" | "releases";
  /** One sentence for the About page. */
  about: string;
  attribution: { name: string; url: string; license?: string };
  /** Base name of ./fixtures/<name>.json (or .sample.json). */
  fixture: string;
  /** Order of its "Also" column. */
  columnOrder: "points" | "recent" | "coverage";
  /** Returns a state to skip the source in live mode, or null to fetch it. */
  skipLive?: (env: NodeJS.ProcessEnv) => SourceState | null;
  fetch: (now: number, windowHours: number, env: NodeJS.ProcessEnv) => Promise<Raw>;
  parse: (raw: Raw) => Article[];
}

const define = <Raw,>(def: SourceDef<Raw>): SourceDef => def as unknown as SourceDef;

export const SOURCES: SourceDef[] = [
  define<AlgoliaResponse>({
    id: "hn",
    label: "Hacker News",
    tabLabel: "HN",
    columnTitle: "Also on Hacker News",
    role: "community",
    about:
      "stories from the last 24 hours with more than 20 points, via the Algolia HN Search API. Hacker News counts as one outlet, the developer signal, however many times a story is posted.",
    attribution: { name: "Algolia HN Search API", url: "https://hn.algolia.com/api" },
    fixture: "hn",
    columnOrder: "points",
    fetch: (now, hours) => fetchHn(now, hours),
    parse: parseHn,
  }),
  define<SontoResponse>({
    id: "sonto",
    label: "Sonto",
    tabLabel: "Tech & AI",
    columnTitle: "Also in tech & AI news",
    role: "news",
    about:
      "tech and AI articles from about 40 outlets such as TechCrunch, Wired, The Verge, Bloomberg and Techmeme. Each article counts under its original outlet. Sonto's own copies of Hacker News are left out.",
    attribution: { name: "Sonto", url: "https://sonto.tech" },
    fixture: "sonto",
    columnOrder: "recent",
    fetch: (now, hours) => fetchSonto(now, hours),
    parse: parseSonto,
  }),
  define<SpaceflightResponse>({
    id: "spaceflight",
    label: "Spaceflight News",
    tabLabel: "Space",
    columnTitle: "Also in space news",
    role: "news",
    about: "space news from outlets such as NASA, SpaceNews and Ars Technica.",
    attribution: { name: "Spaceflight News API", url: "https://spaceflightnewsapi.net" },
    fixture: "spaceflight",
    columnOrder: "recent",
    fetch: (now, hours) => fetchSpaceflight(now, hours),
    parse: parseSpaceflight,
  }),
  define<DeployLogResponse>({
    id: "deploylog",
    label: "The Deploy Log",
    tabLabel: "AI releases",
    columnTitle: "Also shipped in AI",
    role: "releases",
    about:
      "AI product and model releases, each linked to the company's own announcement. The company counts as the outlet.",
    attribution: { name: "The Deploy Log (deployedbyai)", url: "https://deployedbyai.com/log/", license: "CC BY 4.0" },
    fixture: "deploylog",
    columnOrder: "recent",
    fetch: (now, hours) => fetchDeployLog(now, hours),
    parse: parseDeployLog,
  }),
  define<KiwiResponse>({
    id: "kiwi",
    label: "Kiwi News",
    tabLabel: "Kiwi",
    columnTitle: "Also on Kiwi News",
    role: "community",
    about:
      "the latest 25 community-shared links, mostly about crypto and Ethereum. Like Hacker News, it counts as one outlet.",
    attribution: { name: "Kiwi News", url: "https://news.kiwistand.com" },
    fixture: "kiwi",
    columnOrder: "recent",
    fetch: () => fetchKiwi(),
    parse: parseKiwi,
  }),
  define<GridEventsResponse>({
    id: "gridnews",
    label: "GridNews",
    tabLabel: "Markets",
    columnTitle: "Markets",
    role: "markets",
    about: "market news about technology companies, already grouped by story (when enabled).",
    attribution: { name: "GridNews", url: "https://www.gridnews.io" },
    fixture: "gridnews",
    columnOrder: "coverage",
    skipLive: (env) => {
      if (env.GRIDNEWS_ENABLED !== "true") return { status: "disabled", reason: "switched off", quiet: true };
      if (!env.GRIDNEWS_API_KEY) return { status: "disabled", reason: "no GRIDNEWS_API_KEY is configured" };
      return null;
    },
    fetch: (_now, hours, env) => fetchGridnews(env.GRIDNEWS_API_KEY!, hours),
    parse: parseGridnews,
  }),
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s])) as Record<SourceId, SourceDef>;
