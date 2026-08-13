import {
  USAGE_LEADERBOARD_DIMENSION_LIMIT,
  USAGE_LEADERBOARD_LIMIT,
  normalizeUsageLeaderboardPeriod,
  type UsageLeaderboardDimension,
  type UsageLeaderboardEntry,
  type UsageLeaderboardPeriod,
} from "./leaderboard";

/* The public leaderboard cache only stores JSON primitives. In particular,
   cost maps are converted to records before they cross the cache boundary. */
export interface PublicUsageLeaderboardSnapshot {
  all: UsageLeaderboardEntry[];
  top: UsageLeaderboardEntry[];
  sources: string[];
  models: string[];
  costsByUserId: Record<string, number>;
}

function entryDto(entry: UsageLeaderboardEntry): UsageLeaderboardEntry {
  return {
    rank: Number(entry.rank),
    userId: Number(entry.userId),
    handle: String(entry.handle),
    name: String(entry.name),
    avatarUrl: String(entry.avatarUrl),
    totalTokens: Number(entry.totalTokens),
    activeDays: Number(entry.activeDays),
  };
}

export function toPublicUsageLeaderboardEntries(
  entries: readonly UsageLeaderboardEntry[],
): UsageLeaderboardEntry[] {
  return entries.map(entryDto);
}

export function toPublicUsageLeaderboardSnapshot(input: {
  all: readonly UsageLeaderboardEntry[];
  sources: readonly string[];
  models: readonly string[];
  costs: ReadonlyMap<number, number>;
}): PublicUsageLeaderboardSnapshot {
  const all = toPublicUsageLeaderboardEntries(input.all);
  const top = all.slice(0, USAGE_LEADERBOARD_LIMIT);
  const topIds = new Set(top.map((entry) => entry.userId));
  const costsByUserId: Record<string, number> = {};
  for (const [userId, micros] of input.costs) {
    if (topIds.has(userId)) costsByUserId[String(userId)] = Number(micros);
  }
  return {
    all,
    top,
    sources: input.sources.slice(0, USAGE_LEADERBOARD_DIMENSION_LIMIT).map(String),
    models: input.models.slice(0, USAGE_LEADERBOARD_DIMENSION_LIMIT).map(String),
    costsByUserId,
  };
}

export function publicUsageLeaderboardPeriod(value: unknown): UsageLeaderboardPeriod {
  return normalizeUsageLeaderboardPeriod(value);
}

/* Only values offered by the cached TOP-N chips may expand the dimension-cache
   key. Unknown values remain valid share URLs, but are deliberately uncached. */
export function isCachedPublicLeaderboardDimension(
  snapshot: PublicUsageLeaderboardSnapshot,
  dimension: UsageLeaderboardDimension,
  value: string,
): boolean {
  const candidates = dimension === "source" ? snapshot.sources : snapshot.models;
  return value.length > 0 && candidates.includes(value);
}
