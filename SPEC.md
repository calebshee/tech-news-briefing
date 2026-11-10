# Tech News Briefing: Spec (v1)

Agreed through a design interview on 2026-11-10.

## What it is

A public tech-news briefing. It groups articles about the same event across sources ("clusters") and ranks the clusters by how many **independent outlets** covered them. The page refreshes every 6 hours and covers the last 24 hours.

## Who it's for

Tech professionals in general, who want the developer conversation (Hacker News) next to mainstream and markets coverage of the same events. The author is the first user, and the success test below is theirs.

## Sources

| Source | Role | Free-tier limit | Requests per rebuild | Status |
|---|---|---|---|---|
| Hacker News via Algolia HN API (`hn.algolia.com/api/v1`) | Developer signal; points and comments for tie-breaking and fill | No key; rate limit unverified | ~1–2 (`search_by_date`, `tags=story`, last 24h, points filter) | In |
| Sonto (`sonto.tech/api/news`) | Tech and AI news from ~40 outlets (TechCrunch, Wired, The Verge, Bloomberg, Techmeme…), each counted under its own outlet; its HN copies are dropped | No key; CDN rate limiting only | 1 (whole feed, ~2 MB, trimmed to 24h) | In (added 2026-11-10) |
| Spaceflight News API (`api.spaceflightnewsapi.net/v4/articles`) | Space news; `news_site` is the outlet | No key | 1 (`published_at_gte`, `limit=500`) | In (added 2026-11-10) |
| The Deploy Log (`deployedbyai.com/log/data.json`) | AI product and model releases; the vendor is the outlet; weakest headline | No key; **CC BY 4.0, credit required** | 1 (whole log, ~2 MB, trimmed to 24h) | In (added 2026-11-10) |
| Kiwi News (`news.kiwistand.com/api/v1/feeds/new`) | Community-shared crypto/Ethereum links; counts as one community outlet, like HN | No key | 1 (latest 25 only) | In (added 2026-11-10) |
| Currents API | — | — | — | **Removed 2026-11-10** at the user's request: all sources must be keyless |
| Chronicling America, Inshorts, Substack API Wrapper | — | — | — | **Not usable** (checked 2026-11-10): historic archive behind a Cloudflare challenge; hosting down; a Python library for one newsletter at a time |
| GridNews (`api.gridnews.io/api/query`) | Tech-company finance only (Technology sector events); its independent-outlet count | 1,000 req/day, 2 req/s; daily row budget unpublished (check `/usage`) | ~6–10 (`/events?hours=…`, a few `/events/:id`) | Built, **off in production behind an env flag** until GridNews confirms public display is allowed on the free tier |
| The Guardian Open Platform | — | — | — | **Excluded from v1.** Clause 6(g) of its terms bans aggregation and mining. Add only with written permission from licensing@theguardian.com |
| daily.dev Public API | — | — | — | **Dropped.** Its terms ban rival aggregators |
| EdixonAlberto/api-hackernews-node | — | — | — | **Dropped.** Node.js-only, self-hosted, unmaintained since 2023; replaced by Algolia |

### Source obligations

- **The Deploy Log:** CC BY 4.0. Credit "The Deploy Log (deployedbyai)" with a link and the licence, in the footer and on the About page.
- **All sources:** link every headline to the original publisher, and credit each source in the footer.
- **GridNews:** show "Data from GridNews" with a link to gridnews.io, keep the original outlet's attribution and link to the publisher, and cache data no longer than 24h. Don't persist event IDs, because they get rebuilt.
- **All keys** are kept in GitHub Actions repository secrets and used only at build time. GridNews (the only source that needs one) sends its key in the `X-API-Key` header. Never send a key from the browser.

## Clustering and ranking

- **Matching** is a pure, swappable function (`cluster(articles) → clusters`):
  1. Articles with the same canonical URL go in one cluster (normalise scheme, `www`, tracking params, trailing slash).
  2. TF-IDF cosine similarity on title + description, with the threshold tuned on fixtures. Headlines must share at least two meaningful words. The score gets a boost when rare proper nouns overlap (names used by at most 2% of the day's articles); common names like "AWS" earn no boost.
  3. GridNews events arrive pre-clustered and are merged into these clusters by the same similarity.
- **Coverage** is the number of distinct independent outlets per cluster, with wire reprints collapsed. Use GridNews's `independentVoices` where present and the article URL's domain otherwise. Community sites (HN, Kiwi News) count as one outlet each and are never merged with the publisher whose headline they reuse.
- **Ranking:**
  1. Order by coverage.
  2. Break ties on engagement (HN points + comments).
- **Top 10:**
  1. Multi-outlet clusters first.
  2. If there are fewer than 10, top up with the highest-point single HN stories, labelled "HN only".
  3. Other single-outlet stories go to a collapsed "Also trending" list per source.
- **Within each cluster:** compute "first seen on X, N hours before Y" from the earliest published time per source.

## Product

- **Layout:** a desktop dashboard with top clusters in the centre and a column per source at the side ("Also trending"). Below tablet width it collapses to one column with tabs: Top stories, then one tab per source that returned data (HN · Tech & AI · Space · AI releases · Kiwi · (Markets)).
- **Cluster card:**
  - headline, by source role: news outlets first, then markets, community sites, and vendor release notes last
  - outlet badges
  - "N independent outlets · first seen on X"
  - HN points and comments, linked to the discussion
  - an expandable list of every article in the cluster
  - no AI summaries, sentiment or images
- **About page:** the sources, how grouping and ranking work, the 6-hour refresh, and attribution.
- **Footer:** attribution for every source whose data can appear, generated from the source registry (`src/lib/sources/registry.ts`).
- **Sharing:** one site-wide Open Graph image, title and description. No per-cluster permalinks in v1, since clusters have no stable IDs and data expires after 24h.
- **Times** are shown in the viewer's local timezone. Light and dark mode.

## Technical

- **Stack:** Next.js (App Router) + TypeScript, exported as a static site to **GitHub Pages**. This changed from Vercel on 2026-11-10 at the user's request. $0 budget.
- **Data flow:** a scheduled GitHub Actions workflow runs every 6 hours, on every push to `main`, and on demand. It fetches the APIs at build time, with keys from repository secrets, and publishes static HTML. Visitors never trigger API calls, so quotas are independent of traffic.
- **No database:** nothing is stored beyond the published page, which is replaced every 6 hours and so stays within the 24h cache limits.
- **Failure handling:** if every source fails, the build fails and the previous edition stays online. If only some fail, the page publishes with a notice naming the missing source. A static build can't keep the last good data for one source alone.
- **Development:** saved 24h snapshots from each API live in `fixtures/`, refreshed by an occasional script. Unit tests (Vitest) and threshold tuning run against them, and live calls happen only in production and in the refresh script.
- **Analytics:** none in v1, since Vercel Web Analytics isn't available on GitHub Pages.

## Quota budget (4 rebuilds/day)

| Source | Per rebuild | Per day | Limit |
|---|---|---|---|
| Algolia HN | ~2 | ~8 | unpublished |
| Sonto, Spaceflight News, The Deploy Log, Kiwi News | 1 each | 4 each | none published |
| GridNews | ~10 | ~40 | 1,000 (+ row budget) |

## Success criteria

1. After 2 weeks, the author opens the briefing instead of the separate tabs on most mornings.
2. On each day, at least 7 of the top 10 clusters are grouped correctly (no wrong merges).
3. ~~Analytics shows whether visitors return.~~ Deferred, because there are no analytics on GitHub Pages in v1.

## Open actions

- [ ] Email support@gridnews.io to confirm the free tier allows public display, then switch on the GridNews flag.
- [ ] Email licensing@theguardian.com about personal clustering use. Add the Guardian only with written permission.
- [ ] If GridNews is enabled: get its API key, check its `/usage` row budget, and store the key as a repository secret.

## Out of scope for v1

AI or LLM summaries, embeddings, images, accounts, personalisation, archive or history, per-cluster permalinks, daily.dev, the Guardian.
