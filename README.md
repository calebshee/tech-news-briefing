# Tech News Briefing

A public tech-news briefing that groups articles about the same story across Hacker News and mainstream outlets, and ranks each story by how many **independent outlets** covered it. See [SPEC.md](SPEC.md) for the agreed design.

- **Sources:** Hacker News (Algolia HN Search API), Currents API (English technology + business), GridNews (tech-company market news, behind a flag).
- **Hosting:** a static Next.js export on GitHub Pages, rebuilt every 6 hours by a scheduled GitHub Actions job. API keys live in repository secrets and are only used at build time, so none reach the browser.
- **Grouping:** same canonical URL, then TF-IDF similarity on headline + summary with an entity check (`src/lib/cluster.ts`). It's a pure function you can swap out.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000, uses ./fixtures (no API calls)
npm test
```

`fixtures/hn.json` is a real Hacker News snapshot. `fixtures/*.sample.json` are **synthetic** samples with fake `.example` outlets, so the UI can be exercised without keys. The page shows a banner whenever sample data is used. To capture real snapshots:

```bash
cp .env.example .env.local   # add your keys
npm run fixtures:refresh
```

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs on every push to `main`, every 6 hours, and on demand. It tests, builds against the live APIs, and publishes `out/`.

Repository settings:

| Setting | Where | Value |
|---|---|---|
| Pages source | Settings → Pages | GitHub Actions |
| `CURRENTS_API_KEY` | Settings → Secrets → Actions | your Currents key (Currents is skipped without it) |
| `GRIDNEWS_API_KEY` | Settings → Secrets → Actions | your GridNews key |
| `GRIDNEWS_ENABLED` | Settings → Variables → Actions | `true` only once GridNews confirms the free tier allows public display |

If every source fails, the build fails and the previous edition stays online. If only some fail, the page publishes with a notice naming the missing source.

GitHub pauses scheduled workflows in public repositories after 60 days without commits. Re-enable it from the Actions tab if that happens.
