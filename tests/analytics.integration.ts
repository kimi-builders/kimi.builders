import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  applyAnalyticsRetention,
  getAnalyticsInsights,
} from "../src/lib/analytics";
import { getPool } from "../src/lib/db";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.includes("kbu-mysql")) {
  throw new Error(
    "Refusing to run analytics integration tests unless DATABASE_URL includes kbu-mysql",
  );
}

type FixtureEvent = {
  event: string;
  targetKind: string;
  targetId: string;
  viewer: string;
  meta?: Record<string, string> | null;
  createdAt: Date;
};

type FixtureDb = Pick<Pool | PoolConnection, "query">;

type InsightRow = {
  key: string;
  total: number;
  uniqueViewers: number;
};

function viewerHash(stamp: string, label: string) {
  return createHash("sha256")
    .update(`analytics-integration:${stamp}:${label}`)
    .digest("hex");
}

function insightValue(rows: InsightRow[], key: string) {
  return rows.find((row) => row.key === key) ?? {
    key,
    total: 0,
    uniqueViewers: 0,
  };
}

function assertInsightDelta(
  before: InsightRow[],
  after: InsightRow[],
  key: string,
  total: number,
  uniqueViewers: number,
) {
  const beforeValue = insightValue(before, key);
  const afterValue = insightValue(after, key);

  assert.equal(afterValue.total - beforeValue.total, total, `${key} total`);
  assert.equal(
    afterValue.uniqueViewers - beforeValue.uniqueViewers,
    uniqueViewers,
    `${key} distinct viewers`,
  );
}

async function insertFixture(
  db: FixtureDb,
  insertedIds: number[],
  fixture: FixtureEvent,
) {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO analytics_events
       (event, target_kind, target_id, viewer, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      fixture.event,
      fixture.targetKind,
      fixture.targetId,
      fixture.viewer,
      fixture.meta ? JSON.stringify(fixture.meta) : null,
      fixture.createdAt,
    ],
  );

  insertedIds.push(result.insertId);
  return result.insertId;
}

async function cleanupFixtures(pool: Pool, insertedIds: number[]) {
  if (insertedIds.length === 0) return;

  const placeholders = insertedIds.map(() => "?").join(", ");
  await pool.query(
    `DELETE FROM analytics_events WHERE id IN (${placeholders})`,
    insertedIds,
  );
}

async function main() {
  const pool = getPool();
  const insertedIds: number[] = [];
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
  const numericStamp = `${Date.now()}${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
  const viewerA = viewerHash(stamp, "a");
  const viewerB = viewerHash(stamp, "b");
  const workTarget = `${numericStamp}01`;
  const secondaryWorkTarget = `${numericStamp}02`;
  const featuredPostTarget = `${numericStamp}03`;
  const profileTarget = `an_${stamp}`.slice(0, 28);
  const recentNow = new Date();
  const recentCreatedAt = new Date(recentNow.getTime() - 60_000);

  try {
    const before = await getAnalyticsInsights("7d", {
      now: recentNow,
      db: pool,
    });

    const fixtures: FixtureEvent[] = [
      ...[viewerA, viewerA, viewerB].map((viewer) => ({
        event: "home_view",
        targetKind: "page",
        targetId: "home",
        viewer,
        createdAt: recentCreatedAt,
      })),
      {
        event: "leaderboard_view",
        targetKind: "page",
        targetId: "leaderboard",
        viewer: viewerA,
        createdAt: recentCreatedAt,
      },
      ...[viewerA, viewerB].map((viewer) => ({
        event: "awesome_view",
        targetKind: "page",
        targetId: "awesome",
        viewer,
        createdAt: recentCreatedAt,
      })),
      {
        event: "works_view",
        targetKind: "page",
        targetId: "works",
        viewer: viewerA,
        createdAt: recentCreatedAt,
      },
      {
        event: "usage_view",
        targetKind: "page",
        targetId: "usage",
        viewer: viewerB,
        createdAt: recentCreatedAt,
      },
      ...[viewerA, viewerB].map((viewer) => ({
        event: "post_view",
        targetKind: "post",
        targetId: featuredPostTarget,
        viewer,
        createdAt: recentCreatedAt,
      })),
      ...[viewerA, viewerA, viewerB].map((viewer) => ({
        event: "work_view",
        targetKind: "work",
        targetId: workTarget,
        viewer,
        createdAt: recentCreatedAt,
      })),
      {
        event: "work_view",
        targetKind: "work",
        targetId: secondaryWorkTarget,
        viewer: viewerB,
        createdAt: recentCreatedAt,
      },
      ...[viewerA, viewerB].map((viewer) => ({
        event: "profile_view",
        targetKind: "profile",
        targetId: profileTarget,
        viewer,
        createdAt: recentCreatedAt,
      })),
      ...[viewerA, viewerB].map((viewer) => ({
        event: "profile_tab_view",
        targetKind: "profile",
        targetId: profileTarget,
        viewer,
        meta: { tab: "posts" },
        createdAt: recentCreatedAt,
      })),
      ...[viewerA, viewerB, viewerA].map((viewer) => ({
        event: "featured_click",
        targetKind: "post",
        targetId: featuredPostTarget,
        viewer,
        meta: { position: "home" },
        createdAt: recentCreatedAt,
      })),
      {
        event: "featured_click",
        targetKind: "work",
        targetId: workTarget,
        viewer: viewerB,
        meta: { position: "rail" },
        createdAt: recentCreatedAt,
      },
      ...[viewerA, viewerB].map((viewer) => ({
        event: "poster_download",
        targetKind: "surface",
        targetId: "profile",
        viewer,
        meta: { surface: "profile" },
        createdAt: recentCreatedAt,
      })),
      {
        event: "poster_download",
        targetKind: "surface",
        targetId: "usage",
        viewer: viewerA,
        meta: { surface: "usage" },
        createdAt: recentCreatedAt,
      },
      {
        event: "join_click",
        targetKind: "slot",
        targetId: "org",
        viewer: viewerA,
        meta: { slot: "org" },
        createdAt: recentCreatedAt,
      },
    ];

    for (const fixture of fixtures) {
      await insertFixture(pool, insertedIds, fixture);
    }

    const after = await getAnalyticsInsights("7d", {
      now: recentNow,
      db: pool,
    });

    assertInsightDelta(before.eventTotals, after.eventTotals, "home_view", 3, 2);
    assertInsightDelta(
      before.eventTotals,
      after.eventTotals,
      "leaderboard_view",
      1,
      1,
    );
    assertInsightDelta(before.eventTotals, after.eventTotals, "awesome_view", 2, 2);
    assertInsightDelta(before.eventTotals, after.eventTotals, "works_view", 1, 1);
    assertInsightDelta(before.eventTotals, after.eventTotals, "usage_view", 1, 1);
    assertInsightDelta(before.eventTotals, after.eventTotals, "post_view", 2, 2);
    assertInsightDelta(before.eventTotals, after.eventTotals, "work_view", 4, 2);
    assertInsightDelta(before.eventTotals, after.eventTotals, "profile_view", 2, 2);
    assertInsightDelta(
      before.eventTotals,
      after.eventTotals,
      "profile_tab_view",
      2,
      2,
    );
    assertInsightDelta(
      before.eventTotals,
      after.eventTotals,
      "featured_click",
      4,
      2,
    );
    assertInsightDelta(
      before.eventTotals,
      after.eventTotals,
      "poster_download",
      3,
      2,
    );
    assertInsightDelta(before.eventTotals, after.eventTotals, "join_click", 1, 1);

    assertInsightDelta(before.pageViews, after.pageViews, "home_view", 3, 2);
    assertInsightDelta(
      before.pageViews,
      after.pageViews,
      "leaderboard_view",
      1,
      1,
    );
    assertInsightDelta(before.pageViews, after.pageViews, "awesome_view", 2, 2);
    assertInsightDelta(before.pageViews, after.pageViews, "works_view", 1, 1);
    assertInsightDelta(before.pageViews, after.pageViews, "usage_view", 1, 1);
    assertInsightDelta(before.pageViews, after.pageViews, "post_view", 2, 2);
    assertInsightDelta(before.pageViews, after.pageViews, "work_view", 4, 2);
    assertInsightDelta(before.pageViews, after.pageViews, "profile_view", 2, 2);
    assertInsightDelta(
      before.pageViews,
      after.pageViews,
      "profile_tab_view",
      2,
      2,
    );

    assert.deepEqual(
      after.topWorks.find((row) => row.key === workTarget),
      { key: workTarget, total: 3, uniqueViewers: 2 },
    );
    assert.deepEqual(
      after.topProfiles.find((row) => row.key === profileTarget),
      { key: profileTarget, total: 2, uniqueViewers: 2 },
    );
    assert.deepEqual(
      after.featuredClicks.find(
        (row) =>
          row.position === "home" &&
          row.targetKind === "post" &&
          row.targetId === featuredPostTarget,
      ),
      {
        key: `post:${featuredPostTarget}`,
        position: "home",
        targetKind: "post",
        targetId: featuredPostTarget,
        total: 3,
        uniqueViewers: 2,
      },
    );
    assertInsightDelta(
      before.posterDownloads,
      after.posterDownloads,
      "profile",
      2,
      2,
    );

    const fixedEpochSeconds = Math.floor(Date.now() / 1_000);
    const fixedNow = new Date(fixedEpochSeconds * 1_000);
    const dayMs = 24 * 60 * 60 * 1_000;
    const retentionConnection = await pool.getConnection();

    let oldId: number;
    let exactBoundaryId: number;
    let belowBoundaryId: number;

    try {
      // Pin MySQL's current-time functions so the exact 90-day boundary cannot
      // cross a wall-clock second between insertion and retention.
      await retentionConnection.query(`SET timestamp = ${fixedEpochSeconds}`);

      oldId = await insertFixture(retentionConnection, insertedIds, {
        event: "profile_view",
        targetKind: "profile",
        targetId: `old_${profileTarget}`.slice(0, 28),
        viewer: viewerHash(stamp, "old"),
        createdAt: new Date(fixedNow.getTime() - 91 * dayMs),
      });
      exactBoundaryId = await insertFixture(retentionConnection, insertedIds, {
        event: "profile_view",
        targetKind: "profile",
        targetId: `exact_${profileTarget}`.slice(0, 28),
        viewer: viewerHash(stamp, "exact"),
        createdAt: new Date(fixedNow.getTime() - 90 * dayMs),
      });
      belowBoundaryId = await insertFixture(retentionConnection, insertedIds, {
        event: "profile_view",
        targetKind: "profile",
        targetId: `fresh_${profileTarget}`.slice(0, 28),
        viewer: viewerHash(stamp, "below"),
        createdAt: new Date(fixedNow.getTime() - 89 * dayMs),
      });

      const retention = await applyAnalyticsRetention(retentionConnection);
      assert.ok(retention.deleted >= 1, "retention should delete the >90-day row");

      const placeholders = [oldId, exactBoundaryId, belowBoundaryId]
        .map(() => "?")
        .join(", ");
      const [remaining] = await retentionConnection.query<RowDataPacket[]>(
        `SELECT id FROM analytics_events WHERE id IN (${placeholders}) ORDER BY id`,
        [oldId, exactBoundaryId, belowBoundaryId],
      );

      assert.deepEqual(
        remaining.map((row) => Number(row.id)),
        [exactBoundaryId, belowBoundaryId].sort((a, b) => a - b),
        "retention deletes >90 days and keeps exactly/less than 90 days",
      );
    } finally {
      // Discard this connection so the pinned session clock cannot return to
      // the pool even if an assertion fails.
      retentionConnection.destroy();
    }

    console.log("analytics database integration checks passed");
  } finally {
    try {
      await cleanupFixtures(pool, insertedIds);
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
