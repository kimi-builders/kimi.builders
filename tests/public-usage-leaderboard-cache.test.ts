import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { UsageLeaderboardEntry } from "../src/lib/usage/leaderboard";
import {
  isCachedPublicLeaderboardDimension,
  publicUsageLeaderboardPeriod,
  toPublicUsageLeaderboardSnapshot,
} from "../src/lib/usage/public-leaderboard";

function entry(overrides: Partial<UsageLeaderboardEntry> = {}): UsageLeaderboardEntry {
  return {
    rank: 1,
    userId: 7,
    handle: "builder",
    name: "Builder",
    avatarUrl: "/avatar.svg",
    totalTokens: 123,
    activeDays: 2,
    ...overrides,
  };
}

test("public leaderboard periods and cached dimensions have bounded keys", () => {
  assert.equal(publicUsageLeaderboardPeriod("24h"), "24h");
  assert.equal(publicUsageLeaderboardPeriod("30d"), "30d");
  assert.equal(publicUsageLeaderboardPeriod("attacker-controlled"), "7d");
  const snapshot = toPublicUsageLeaderboardSnapshot({
    all: [entry()],
    sources: ["kimi-code", "codex"],
    models: ["kimi-k3"],
    costs: new Map([[7, 45]]),
  });
  assert.equal(isCachedPublicLeaderboardDimension(snapshot, "source", "kimi-code"), true);
  assert.equal(isCachedPublicLeaderboardDimension(snapshot, "model", "kimi-k3"), true);
  assert.equal(isCachedPublicLeaderboardDimension(snapshot, "source", "old-shared-url"), false);
  assert.equal(isCachedPublicLeaderboardDimension(snapshot, "model", ""), false);
});

test("public leaderboard snapshot whitelists entries and converts Map to JSON record", () => {
  const snapshot = toPublicUsageLeaderboardSnapshot({
    all: [entry(), entry({ rank: 2, userId: 8, handle: "second" })],
    sources: Array.from({ length: 12 }, (_, i) => `source-${i}`),
    models: Array.from({ length: 12 }, (_, i) => `model-${i}`),
    costs: new Map([
      [7, 45],
      [999, 123],
    ]),
  });
  assert.deepEqual(snapshot.costsByUserId, { "7": 45 });
  assert.equal(snapshot.sources.length, 10);
  assert.equal(snapshot.models.length, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.deepEqual(Object.keys(snapshot.all[0]).sort(), [
    "activeDays",
    "avatarUrl",
    "handle",
    "name",
    "rank",
    "totalTokens",
    "userId",
  ]);
});

test("cache adapters separate full snapshot, preview, and bounded dimensions", () => {
  const cache = readFileSync(
    new URL("../src/lib/usage/public-leaderboard-cache.ts", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../app/(app)/usage/leaderboard/page.tsx", import.meta.url),
    "utf8",
  );
  const rail = readFileSync(
    new URL("../app/(app)/_components/rail/CommunityWidgets.tsx", import.meta.url),
    "utf8",
  );
  assert.match(cache, /unstable_cache\(/);
  assert.match(cache, /revalidate: PUBLIC_USAGE_LEADERBOARD_REVALIDATE_SECONDS/);
  assert.match(
    cache,
    /tags: \[PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, PUBLIC_USERS_CACHE_TAG\]/,
  );
  assert.match(cache, /getUsageLeaderboard\(period, \{ limit: 0, now \}\)/);
  assert.match(cache, /getUsageLeaderboard\("30d", \{ limit: 50 \}\)/);
  assert.match(cache, /isCachedPublicLeaderboardDimension\(snapshot, dimension, value\)/);
  assert.match(cache, /return getUsageLeaderboard\(boundedPeriod, \{ \[dimension\]: value \}\)/);
  assert.doesNotMatch(cache, /getSessionUser|getUsageSettings|getLocale|cookies\(|headers\(/);
  assert.match(page, /getPublicUsageLeaderboardSnapshot\(period\)/);
  assert.match(page, /getPublicUsageLeaderboardDimension\(/);
  assert.match(rail, /getPublicUsageLeaderboardPreview\(\)/);
  assert.doesNotMatch(rail, /getUsageLeaderboard\("30d"\)/);
});

test("usage mutation paths invalidate leaderboard with privacy-safe semantics", () => {
  const actions = readFileSync(
    new URL("../app/(app)/usage/actions.ts", import.meta.url),
    "utf8",
  );
  const settingsRoute = readFileSync(
    new URL("../app/api/usage/settings/route.ts", import.meta.url),
    "utf8",
  );
  const ingestRoute = readFileSync(
    new URL("../app/api/usage/ingest/route.ts", import.meta.url),
    "utf8",
  );
  const usageRoute = readFileSync(
    new URL("../app/api/usage/route.ts", import.meta.url),
    "utf8",
  );
  const deviceRoute = readFileSync(
    new URL("../app/api/usage/devices/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const approveRoute = readFileSync(
    new URL("../app/api/usage/device/approve/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(actions, /updateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG\)/);
  assert.match(actions, /if \(mode !== "revoke"\) updateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG\)/);
  assert.match(settingsRoute, /revalidateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, \{ expire: 0 \}\)/);
  assert.match(ingestRoute, /settings\.showOnLeaderboard && ingested\.buckets > 0/);
  assert.match(ingestRoute, /revalidateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, "max"\)/);
  assert.match(ingestRoute, /revalidateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, \{ expire: 0 \}\)/);
  assert.match(usageRoute, /revalidateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, \{ expire: 0 \}\)/);
  assert.match(deviceRoute, /if \(revoked && deleteData\)/);
  assert.match(deviceRoute, /revalidateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, \{ expire: 0 \}\)/);
  assert.match(approveRoute, /if \(result === "approved" && settings\)/);
  assert.match(approveRoute, /revalidateTag\(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, \{ expire: 0 \}\)/);
});
