# Tech News Briefing

A public tech-news briefing that groups articles about the same story across Hacker News and news outlets, and ranks each story by how many **independent outlets** covered it. See [SPEC.md](SPEC.md) for the agreed design.

- **Sources (all keyless):**

  | Source | What it adds |
  |---|---|
  | Hacker News (Algolia HN Search API) | The developer conversation |
  | Sonto | Tech and AI news from about 40 outlets |
  | Spaceflight News API | Space news |
  | The Deploy Log | AI product releases (CC BY 4.0) |
  | Kiwi News | Community crypto links |
  | GridNews (needs a key) | Tech-company market news, behind a flag |

  Each source is one entry in `src/lib/sources/registry.ts`.
- **Hosting:** a static Next.js export on GitHub Pages, rebuilt every 6 hours by a scheduled GitHub Actions job.
- **Grouping:** same canonical URL, then TF-IDF similarity on headline + summary with entity checks (`src/lib/cluster.ts`). It's a pure function you can swap out.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000, uses ./fixtures (no API calls)
npm test
```

`fixtures/*.json` are real 24h snapshots from each keyless source. `fixtures/gridnews.sample.json` is a **synthetic** sample with fake `.example` outlets, so the GridNews code path can run without a key. The page shows a banner whenever sample data is used. To refresh the snapshots:

```bash
npm run fixtures:refresh
```

## Adding a source

1. Write an adapter in `src/lib/sources/<name>.ts` with `fetch<Name>` (trim to the window) and `parse<Name>` (to `Article[]`).
2. Add its id to `SourceId` in `src/lib/types.ts`.
3. Add one entry to `SOURCES` in `src/lib/sources/registry.ts`: its label, role, attribution and About text.
4. Add a badge colour (`.badge.src-<id>`) in `src/app/globals.css`, then run `npm run fixtures:refresh`.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs on every push to `main`, every 6 hours, and on demand. It tests, builds against the live APIs, and publishes `out/`. The keyless sources need no settings. Only GridNews does:

| Setting | Where | Value |
|---|---|---|
| Pages source | Settings → Pages | GitHub Actions |
| `GRIDNEWS_API_KEY` | Settings → Secrets → Actions | your GridNews key |
| `GRIDNEWS_ENABLED` | Settings → Variables → Actions | `true` only once GridNews confirms the free tier allows public display |

If every source fails, the build fails and the previous edition stays online. If only some fail, the page publishes with a notice naming the missing source.

GitHub pauses scheduled workflows in public repositories after 60 days without commits. Re-enable it from the Actions tab if that happens.
