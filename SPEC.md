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
| Currents API (`api.currentsapi.services/v1`) | Mainstream outlets, English, `technology` + `business` | 250 req/day, 20 results/req, quota resets 00:00 UTC | ~16 (`/search`, `start_date` = now−24h, ≤8 pages per category) | In |
| GridNews (`api.gridnews.io/api/query`) | Tech-company finance only (Technology sector events); its independent-outlet count | 1,000 req/day, 2 req/s; daily row budget unpublished (check `/usage`) | ~6–10 (`/events?hours=…`, a few `/events/:id`) | Built, **off in production behind an env flag** until GridNews confirms public display is allowed on the free tier |
| The Guardian Open Platform | — | — | — | **Excluded from v1.** Clause 6(g) of its terms bans aggregation and mining. Add only with written permission from licensing@theguardian.com |
| daily.dev Public API | — | — | — | **Dropped.** Its terms ban rival aggregators |
| EdixonAlberto/api-hackernews-node | — | — | — | **Dropped.** Node.js-only, self-hosted, unmaintained since 2023; replaced by Algolia |

### Source obligations

- **Currents:** attribution plus a link to each original article.
- **GridNews:** show "Data from GridNews" with a link to gridnews.io, keep the original outlet's attribution and link to the publisher, and cache data no longer than 24h. Don't persist event IDs, because they get rebuilt.
- **All keys** are kept server-side in Vercel env vars. GridNews's key goes in the `X-API-Key` header and Currents' key in an `Authorization: Bearer` header. Never send a key from the browser.

## Clustering and ranking

- **Matching** is a pure, swappable function (`cluster(articles) → clusters`):
  1. Articles with the same canonical URL go in one cluster (normalise scheme, `www`, tracking params, trailing slash).
  2. TF-IDF cosine similarity on title + description, with the threshold tuned on fixtures. It gets a boost when proper nouns (capitalised tokens) overlap.
  3. GridNews events arrive pre-clustered and are merged into these clusters by the same similarity.
- **Coverage** is the number of distinct independent outlets per cluster, with wire reprints collapsed. Use GridNews's `independentVoices` where present and the article URL's domain otherwise. HN counts as the developer signal.
- **Ranking:**
  1. Order by coverage.
  2. Break ties on engagement (HN points + comments).
- **Top 10:**
  1. Multi-outlet clusters first.
  2. If there are fewer than 10, top up with the highest-point single HN stories, labelled "HN only".
  3. Other single-outlet stories go to a collapsed "Also trending" list per source.
- **Within each cluster:** compute "first seen on X, N hours before Y" from the earliest published time per source.

## Product

- **Layout:** a desktop dashboard with top clusters in the centre and a column per source at the side ("Also trending"). Below tablet width it collapses to one column with tabs: Top stories · HN · Currents · (GridNews).
- **Cluster card:**
  - headline, taken from the most mainstream outlet in the cluster
  - outlet badges
  - "N independent outlets · first seen on X"
  - HN points and comments, linked to the discussion
  - an expandable list of every article in the cluster
  - no AI summaries, sentiment or images
- **About page:** the sources, how grouping and ranking work, the 6-hour refresh, and attribution.
- **Footer:** attribution for Currents, GridNews (when enabled) and Hacker News/Algolia.
- **Sharing:** one site-wide Open Graph image, title and description. No per-cluster permalinks in v1, since clusters have no stable IDs and data expires after 24h.
- **Times** are shown in the viewer's local timezone. Light and dark mode.

## Technical

- **Stack:** Next.js (App Router) + TypeScript on Vercel's free (Hobby) plan. $0 budget.
- **Data flow:** the page is cached and regenerated every 6 hours (`revalidate = 21600`), with fetches running in server code only. Visitors never trigger API calls, so quotas are independent of traffic.
- **No database:** nothing is stored beyond the cached page, which keeps within the 24h cache limits.
- **Failure handling:** if a source fails during a rebuild, keep the last good version of the page and show a notice naming the missing source.
- **Development:** saved 24h snapshots from each API live in `fixtures/`, refreshed by an occasional script. Unit tests (Vitest) and threshold tuning run against them, and live calls happen only in production and in the refresh script.
- **Analytics:** Vercel Web Analytics (free, cookieless).

## Quota budget (4 rebuilds/day)

| Source | Per rebuild | Per day | Limit |
|---|---|---|---|
| Algolia HN | ~2 | ~8 | unpublished |
| Currents | ~16 | ~64 | 250 |
| GridNews | ~10 | ~40 | 1,000 (+ row budget) |

## Success criteria

1. After 2 weeks, the author opens the briefing instead of the separate tabs on most mornings.
2. On each day, at least 7 of the top 10 clusters are grouped correctly (no wrong merges).
3. Analytics shows whether visitors return. There's no target for v1.

## Open actions

- [ ] Email support@gridnews.io to confirm the free tier allows public display, then switch on the GridNews flag.
- [ ] Email licensing@theguardian.com about personal clustering use. Add the Guardian only with written permission.
- [ ] Get API keys for Currents and GridNews, check GridNews's `/usage` row budget, and record keys in `.env.local` (never commit them).

## Out of scope for v1

AI or LLM summaries, embeddings, images, accounts, personalisation, archive or history, per-cluster permalinks, daily.dev, the Guardian.
