# Performance deep dive

Date: 2026-08-12

Branch: `perf/deep-dive`

Baseline: `28785cd` (cache comparisons use `d42007e`, after the P0 usage work)

Database: isolated `mysql://root@127.0.0.1:3306/kbu-mysql`, MySQL 9.7.1

QA: production build + `next start` on `:3112`; ports `:3000` and `:3111` were not touched

## Executive summary

- The 30-day usage overview now meets the 100k-row acceptance target: p95
  **281.9ms → 249.3ms**, with real SQL statements **15 → 7** and returned
  rows **43,706 → 25,838**.
- Anonymous public pages now cache JSON-only public DTOs. In ten-request page
  runs, SQL fell from **90 → 27** for community, **70 → 25** for works, and
  **40 → 4** for Awesome. Remaining warm `/works` SQL is intentionally private
  claim verification.
- A 50-member/100k-bucket public leaderboard changed from **5 SQL on every
  request** to **5 on the cold miss and 0 on nine warm hits**. Warm median total
  response time was **26.9ms → 8.7ms**.
- The query audit added only two EXPLAIN-proven indexes. Latest-feed scans fell
  from 1,001 rows plus filesort to 51–55 ordered index rows. A recursive
  comment page over a 10k-comment tree in a 100k-comment table improved by
  **33%–55%**, depending on the AI visibility mode.
- Same-rail soft navigation no longer refreshes the entire server tree. Cross
  rail, detail-ID, and width changes retain the refresh and stale-rail guard.
- All API response shapes and the auth/upload/storage/cron/deployment boundaries
  were preserved.

## Measurement method

- Fixtures used fixed timestamps and dedicated `__perf_*` users. Mutating scripts
  rejected every database except exact host `127.0.0.1`, port `3306`, and schema
  `kbu-mysql`.
- Usage measurements reused the existing `usage.operation` timing boundary and
  a temporary pool trace. `diagnostics.rowsFetched` is explicitly treated as
  returned rows, not scanned rows.
- Public-page measurements used `performance_schema` digest deltas for statement
  count, rows examined/sent, and DB wall time. Baseline and after used the same
  isolated schema and data.
- Cache runs used one cold request followed by nine warm requests. Page latency
  includes RSC/rendering; target-query counts are reported separately so dynamic
  session, Demo, and private claim work is not mislabeled as a cache miss.
- Index work used `EXPLAIN ANALYZE`. Each migration was run twice: the first run
  applied one statement and the second reported `nothing to apply`.
- Fixtures were deleted after measurement. Final verification found zero perf
  users/facts/comments and restored the original isolated scale: 5 users, 1
  post, 6 comments, 1 work, and 138 usage buckets.

## P0 — usage dashboard

### Startup query reduction

`getUsageSettings` previously performed `INSERT IGNORE` followed by `SELECT` on
every hit. It now reads first, inserting and re-reading only on a miss. A racing
initializer still returns the winning row. The usage page also starts the device
request before waiting for settings.

| Hot-path item | Before | After |
| --- | ---: | ---: |
| Settings SQL | 2 | 1 |
| Device request start | after settings | before settings |

The task description called the overview queries “14 serial queries.” Inspection
showed one awaited price query followed by an eager batch constrained by the
10-connection pool (14 statements with projects off, 15 with projects on). The
fix therefore did not increase the pool limit.

### Overview consolidation

The implementation keeps the response contract intact while:

- loading prices concurrently;
- reading current, previous, and weekly bucket windows through one envelope;
- reading current and previous session windows through one envelope;
- deriving project/device distributions and active devices from the shared rows;
- returning records total with `COUNT(*) OVER()` plus an out-of-range fallback;
- combining lifetime totals and bucket/session last-sync timestamps;
- reusing per-row price estimates across heatmap and distributions.

Formal fixture: 100,000 buckets, 5,000 sessions, 10 devices, 365 days; 3 warmups
and 10 measured runs.

| 30-day overview | Before | After | Change |
| --- | ---: | ---: | ---: |
| Median | 272.5ms | 232.2ms | -14.8% |
| p95 | 281.9ms | 249.3ms | -11.6% |
| Page-core median | 275.8ms | 233.0ms | -15.5% |
| SQL statements | 15 | 7 | -53.3% |
| Returned rows | 43,706 | 25,838 | -40.9% |

The response shape, token totals, record count, ordering, and options matched.
The normalized digest differed only in floating-point cost accumulation order
(less than `5e-7` microdollars).

Trade-off: the 90-day stress case moved from median/p95 **566.3/584.0ms** to
**606.6/672.5ms**, because the shared envelope returns a wider row set. The
required/default 30-day case has margin below 300ms; a separate 90-day aggregate
strategy is left as follow-up rather than complicating the main path.

## P1 — public caching

### Safety boundary

Only anonymous/public database DTOs cross `unstable_cache`. Cache callbacks do
not import session, cookies, headers, locale, React nodes, private usage settings,
viewer reactions, Demo RSVP state, moderation controls, or work claim totals.
Dates become ISO strings and maps become records before serialization.

- Feed: anonymous, no subscriber/viewer, no cursor; TTL 30s.
- Works/Awesome: anonymous first page only; TTL 60s. Claim verification stays
  dynamic and outside the cache.
- Leaderboard: opt-in public snapshot and a smaller community preview; TTL 60s.
- Community sidebar: TTL 120s; featured: TTL 300s; Works/Awesome rails: TTL 120s.
- Feed/works parameters are canonicalized to finite registries. Unknown
  leaderboard dimension URLs remain valid but bypass the dimension cache.
- SQL and DTO layers both reject private/hidden content. The leaderboard cost
  query independently joins `usage_settings.show_on_leaderboard = 1`.

Privacy-removing Server Actions use immediate `updateTag`. Route Handlers use
`revalidateTag(tag, { expire: 0 })`; additive public ingest uses `"max"`. The
`/api/usage/*` response bodies/statuses were not changed. `/api/cron/*` was not
modified.

### Feed and list measurements

Feed fixture: 1,000 posts (960 public-visible, 20 private, 20 hidden). Works
fixture: 600 works (570 public-visible, 15 private, 15 hidden).

| Target query, 10 requests | Before | After | Warm target SQL |
| --- | ---: | ---: | ---: |
| Community feed, new/hot | 10 | 1 cold | 0 |
| `/works` list | 10 | 1 cold | 0 |
| `/awesome` list | 10 | 1 cold | 0 |

The works list cold query examined/sent 318/101 rows; Awesome examined/sent
432/201. After the first request those exact digests did not increment. Anonymous
HTML contained public sentinels and none of the private/hidden post sentinels.
Unit tests repeat the SQL and DTO privacy assertions for both posts and works.

List-only HTTP medians changed little because rendering and intentionally dynamic
work remain: roughly **22.4→21.0ms** for `/works` warm requests and
**33.3→32.2ms** for `/awesome`. SQL removal, not synthetic localhost latency,
is the durable win.

### Rail and whole-page measurements

Scale for this comparison: 1,000 posts, 600 works, 100,000 comments, 50 opt-in
users, and 100,000 usage buckets. Both sides used the final schema so indexes do
not confound cache results.

| 10 page requests | Before SQL | After SQL | Warm SQL/request | Rows examined before→after | DB time before→after |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/community?sort=new` | 90 | 27 | 2 Demo | 1,460,960→146,113 | 1,095.9→192.9ms |
| `/works` | 70 | 25 | 2 private claims | 41,340→27,543 | 254.6→137.1ms |
| `/awesome` | 40 | 4 | 0 | 13,320→1,332 | 81.2→8.7ms |

Community warm median/p95 total time improved from **60.3/61.7ms** to
**15.5/22.3ms**. Works warm median was **34.0→31.5ms**, with the remaining two
large usage/claim statements deliberately uncached. Awesome warm median stayed
near **32.6→32.1ms** while all database work disappeared.

### Leaderboard measurement

Fixture: 50 opted-in users, 100,000 buckets, four sources/models, fixed 24-hour
window. Baseline runs issued all + source chips + model chips + prices + costs on
every request.

| 10 requests | Before | After |
| --- | ---: | ---: |
| Public leaderboard SQL | 50 | 5 cold + 0 warm |
| Rows examined | 45,790 | 5,641 |
| DB statement time | 493.3ms | 91.3ms |
| Warm median total time | 26.9ms | 8.7ms |
| Warm p95 total time | 34.7ms | 12.2ms |

The community rail uses a separate one-query preview so a rail miss does not
load dimensions or prices. Session/settings/“my rank” selection remains outside
both caches.

## P1 — site-wide query audit

Audited paths: feed first page/pagination, post comment detail, Works/Awesome,
leaderboard, and profile tabs. Indexes were added only where the final plan and
representative data showed a concrete service query.

### Profile tab gating

The profile previously loaded one heatmap query and two sequential top-dimension
queries for every usage-visible tab. Heatmap is now requested only by `usage` or
`prefs`; top dimensions only by `prefs`. Daily activity and the all-time snapshot
remain because the Hero/annual footprint consumes them.

| Active tab | SQL saved/request |
| --- | ---: |
| posts/comments/works/tools | 3 |
| usage | 2 |
| prefs | 0 |

On 10 public `posts` requests, the three target digests fell from **30 → 0** and
eliminated 60,010 examined rows. Warm median total time was **52.0→51.0ms**;
other all-time profile aggregates still dominate.

### Migration `20260901_posts_live_feed_index.sql`

Index: `(deleted_at, created_at, id)`. It serves both anonymous and signed-in
latest feeds while preserving the existing `created_at DESC, id DESC` product
order. Category feeds continue to use `idx_feed`.

| EXPLAIN ANALYZE, 1,001 posts | Before | After |
| --- | --- | --- |
| Anonymous latest | table scan 1,001 + sort, 2.63ms | reverse index scan 55, 0.49ms |
| Signed-in latest | table scan 1,001 + sort, 1.88ms | reverse index scan 51, 0.35ms |
| Category latest | existing `idx_feed` | 55 rows, 0.31ms |

An `ORDER BY id` rewrite was rejected: 983 fixture rows had ID/time inversions,
and response digests differed. The optimization therefore does not alter order.

### Migration `20260902_comment_parent_index.sql`

Index: `(parent_id, deleted_at, hidden_at, is_ai)`. It changes each recursive
frontier step from repeated full comment-table scans to covering child lookups.

Fixture: one post with a 10,000-comment, multi-level tree; 90,000 unrelated
comments across other posts.

| Comment page | Before | After | Change |
| --- | ---: | ---: | ---: |
| `showAi=true` | 96.6ms | 64.5ms | -33.2% |
| `showAi=false` | 65.8ms | 29.5ms | -55.2% |

`schema.sql` now also includes the already-deployed
`idx_comments_hidden_id (hidden_at, id)`, fixing schema/migration drift.

### Deliberately not indexed or rewritten

- Hot feed uses a time-decay expression and still needs computed ordering; its
  short cache is preferable to an unrelated “insurance” index.
- Works JSON filters and hot order scanned only 301–601 rows in the fixture and
  are now behind a public cache. No write-amplifying index was justified.
- No profile-specific posts index was added: the generic feed index gave nearly
  the same dense-author plan, while sparse authors already use `idx_user`.
- No `(bucket_start, user_id)` leaderboard index was added. Cache removes warm
  pressure, and a cross-user index needs a larger production-shaped benchmark
  before accepting ingest write amplification.

## P2 — navigation refresh cost

`RailRefresher` and `RailGate` now share a pure decision key:
`kind + detail id + wide`. Results are deterministic navigation event counts:

| Navigation | Before refresh | After refresh |
| --- | ---: | ---: |
| Same rail context (usage subpages, profile handles, blog/learn slugs, community fallbacks) | 1 | 0 |
| Different rail kind or wide mode | 1 | 1 |
| Different post/work detail ID | 1 | 1 |

The stale-rail hiding guard compares the same key, so suppressing refresh cannot
leave a same-context rail permanently hidden. Full removal was rejected because
route-dependent server rails would need a larger layout/parallel-route rewrite.
One trade-off is explicit: same-context navigation no longer incidentally
refreshes top-bar unread counts; existing explicit mutation refreshes remain.

## Engineering quality

- Cache policy/DTO modules are pure and independently tested; request-dependent
  rendering stays in components.
- Cache tags live in one dependency-free registry rather than coupling mutation
  paths to cached query graphs.
- Profile query selection and rail decisions are pure, typed helpers with matrix
  tests.
- Usage records pagination now has one count source for normal pages and a tested
  fallback for out-of-range pages.
- Stale right-rail comments were corrected from `template.tsx`/1120px to the
  actual `layout.tsx`/1000px behavior.
- Broader repeated-pattern refactors were intentionally skipped where Actions,
  Route Handlers, privacy removal, and SWR additions require different cache
  semantics; merging them would obscure correctness rather than improve it.

## Verification and compatibility

Each small item passed, before the next item, the required gates:

```text
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Final suite: **334/334 tests passed**, lint clean, typecheck clean, and the
production build completed cleanly. Isolated usage, works-visibility, moderation,
post-visibility, and comment-dedup integration suites also passed. Usage coverage
includes timezone/price windows, project-off behavior, revoked devices, empty
pages, and out-of-range record totals.

Compatibility checks:

- `/api/usage/*` response shapes are unchanged.
- No auth, email, upload, storage, cron route, deployment, or package dependency
  changes.
- No production database read/write or migration was performed.
- `main` remains at `28785cd`; all commits are on `perf/deep-dive`.

## Follow-up recommendations

1. Recheck the new MySQL plans on production MySQL 8 after deploy; do not add
   `FORCE INDEX`, because filtered usage queries may legitimately prefer other
   indexes.
2. If PM2 moves beyond the current single instance, configure a shared Next Data
   Cache handler and cross-process tag invalidation before relying on cache
   coherence.
3. AI reply workers and provider-avatar sync deliberately do not import
   `next/cache` across their runtime boundaries. Public cards may be stale for
   at most their 30–120s TTL after those background writes.
4. Retention cron was an absolute task boundary, so leaderboard deletion caused
   by retention relies on the 60s TTL. Add explicit invalidation only in a
   separately reviewed cron/API change.
5. Investigate a 90-day-specific usage aggregate/envelope if 90-day dashboard
   traffic is material; the current change optimizes and passes the default 30d
   acceptance case.
6. Benchmark a leaderboard `(bucket_start, user_id)` index with at least 100
   opt-in users × 1,000 buckets before deciding. Warm requests already execute
   zero leaderboard SQL.
7. Split Works list/card projection from the detail projection. Current cards
   fetch fields such as `description_md`, models, and image arrays that list
   rendering does not always consume.
8. Community cold sidebar stats still examine the comments population. The
   120-second cache contains normal traffic cost, but a denormalized or materialized
   public counter may be warranted at multi-million-comment scale.
9. Revisit a segment/parallel-route rail architecture only if eliminating all
   cross-context `router.refresh()` becomes more valuable than its privacy and
   stale-layout regression risk.

## Codebase health assessment

Overall health is **good, with localized scale debt**. Privacy gates, the usage
contract, versioned pricing, migration checkpointing, and the test suite are
strong. The main risks are cold aggregate scans, multi-process cache coherence,
and a few wide list projections—not broad architectural instability. The work in
this branch reduces steady-state database pressure substantially without hiding
private data in shared caches or expanding the protected API surface.

## Atomic commits

1. `ba3e81d` — `perf(usage): reduce dashboard startup queries`
2. `d42007e` — `perf(usage): consolidate overview queries`
3. `1e90865` — `perf(cache): cache anonymous community feed`
4. `4abd1ad` — `perf(cache): cache anonymous works listings`
5. `7c4d954` — `perf(cache): cache public rail aggregates`
6. `3807641` — `perf(cache): cache public usage leaderboard`
7. `e97edd0` — `perf(profile): skip unused usage queries by tab`
8. `b86d2b7` — `perf(db): index live post feed`
9. `6df2b74` — `perf(db): index recursive comment children`
10. `b3a7968` — `perf(shell): refresh only when rail context changes`
11. `471b1ff` — `chore(shell): align rail comments with layout`
