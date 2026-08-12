/* Shared cache for opt-in public usage aggregates only. Session state, locale,
   private settings, and "my rank" rendering stay in the page request. Cache
   Components are disabled in this app, so this uses unstable_cache. */
import { unstable_cache } from "next/cache";
import {
  PUBLIC_USAGE_LEADERBOARD_CACHE_TAG,
  PUBLIC_USERS_CACHE_TAG,
} from "../cache-tags";
import {
  getUsageLeaderboard,
  getUsageLeaderboardCosts,
  getUsageLeaderboardDimensions,
  type UsageLeaderboardDimension,
  type UsageLeaderboardEntry,
  type UsageLeaderboardPeriod,
} from "./leaderboard";
import {
  isCachedPublicLeaderboardDimension,
  publicUsageLeaderboardPeriod,
  toPublicUsageLeaderboardEntries,
  toPublicUsageLeaderboardSnapshot,
  type PublicUsageLeaderboardSnapshot,
} from "./public-leaderboard";

export const PUBLIC_USAGE_LEADERBOARD_REVALIDATE_SECONDS = 60;

async function loadSnapshotDto(
  period: UsageLeaderboardPeriod,
): Promise<PublicUsageLeaderboardSnapshot> {
  /* One timestamp keeps the cutoff identical across every statement in this
     snapshot. The first three independent queries start together. */
  const now = new Date();
  const [all, sources, models] = await Promise.all([
    getUsageLeaderboard(period, { limit: 0, now }),
    getUsageLeaderboardDimensions("source", period, { now }),
    getUsageLeaderboardDimensions("model", period, { now }),
  ]);
  const costs = await getUsageLeaderboardCosts(
    all.slice(0, 50).map((entry) => entry.userId),
    period,
    { now },
  );
  return toPublicUsageLeaderboardSnapshot({ all, sources, models, costs });
}

const getCachedSnapshotDto = unstable_cache(
  loadSnapshotDto,
  ["public-usage-leaderboard-snapshot-v1"],
  {
    revalidate: PUBLIC_USAGE_LEADERBOARD_REVALIDATE_SECONDS,
    tags: [PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, PUBLIC_USERS_CACHE_TAG],
  },
);

export async function getPublicUsageLeaderboardSnapshot(
  period: UsageLeaderboardPeriod,
): Promise<PublicUsageLeaderboardSnapshot> {
  return getCachedSnapshotDto(publicUsageLeaderboardPeriod(period));
}

/* The community rail needs one fixed 30d TOP-50 query so it can append the
   signed-in viewer when they are outside TOP 4. It intentionally does not load
   costs or dimension chips from the full snapshot. */
async function loadPreviewDto(): Promise<UsageLeaderboardEntry[]> {
  return toPublicUsageLeaderboardEntries(
    await getUsageLeaderboard("30d", { limit: 50 }),
  );
}

const getCachedPreviewDto = unstable_cache(
  loadPreviewDto,
  ["public-usage-leaderboard-community-preview-v1"],
  {
    revalidate: PUBLIC_USAGE_LEADERBOARD_REVALIDATE_SECONDS,
    tags: [PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, PUBLIC_USERS_CACHE_TAG],
  },
);

export async function getPublicUsageLeaderboardPreview(): Promise<UsageLeaderboardEntry[]> {
  return getCachedPreviewDto();
}

async function loadDimensionDto(
  period: UsageLeaderboardPeriod,
  dimension: UsageLeaderboardDimension,
  value: string,
): Promise<UsageLeaderboardEntry[]> {
  return toPublicUsageLeaderboardEntries(
    await getUsageLeaderboard(period, {
      [dimension]: value,
    }),
  );
}

const getCachedDimensionDto = unstable_cache(
  loadDimensionDto,
  ["public-usage-leaderboard-dimension-v1"],
  {
    revalidate: PUBLIC_USAGE_LEADERBOARD_REVALIDATE_SECONDS,
    tags: [PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, PUBLIC_USERS_CACHE_TAG],
  },
);

export async function getPublicUsageLeaderboardDimension(
  period: UsageLeaderboardPeriod,
  dimension: UsageLeaderboardDimension,
  value: string,
  snapshot: PublicUsageLeaderboardSnapshot,
): Promise<UsageLeaderboardEntry[]> {
  const boundedPeriod = publicUsageLeaderboardPeriod(period);
  if (isCachedPublicLeaderboardDimension(snapshot, dimension, value)) {
    return getCachedDimensionDto(boundedPeriod, dimension, value);
  }
  /* Preserve old/shared URLs whose dimension has fallen out of TOP 10 without
     allowing arbitrary request parameters to create persistent cache keys. */
  return getUsageLeaderboard(boundedPeriod, { [dimension]: value });
}
