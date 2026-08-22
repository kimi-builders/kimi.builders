/* Data cache for the monthly letter's L1 stats snapshot.
   getMonthlyStatsSnapshot is a four-way aggregate (community stats /
   work count / token total / 30-day usage window) — recomputing it on
   every letter detail request is too expensive, and snapshot semantics
   tolerate minutes of staleness. Same pattern as public-feed-cache /
   public-works-cache: the cache module stands alone so monthly.ts stays
   a pure module importable by unit tests (unstable_cache throws an
   invariant outside the Next runtime). Blog actions invalidate the tag
   on publish/unpublish. */
import { unstable_cache } from "next/cache";
import { PUBLIC_MONTHLY_STATS_CACHE_TAG } from "./cache-tags";
import { getMonthlyStatsSnapshot } from "./monthly";

/* Fallback TTL: tokens/counters keep flowing — at most 5 minutes stale
   even without publishes. */
export const MONTHLY_STATS_REVALIDATE_SECONDS = 5 * 60;

export const getCachedMonthlyStatsSnapshot = unstable_cache(
  getMonthlyStatsSnapshot,
  ["monthly-stats-snapshot-v1"],
  {
    revalidate: MONTHLY_STATS_REVALIDATE_SECONDS,
    tags: [PUBLIC_MONTHLY_STATS_CACHE_TAG],
  },
);
