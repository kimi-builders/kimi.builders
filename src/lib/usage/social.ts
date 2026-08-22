/* Usage social surface: the profile heatmap and the work "verified build
   effort" badge. Privacy gate: both consume only
   usage_settings.show_on_leaderboard (the opt-in flag; column default 0 =
   private; settings.ts owns that column, not this file). Without opt-in
   there is no data — callers render no marker at all (no negative
   signaling). Heatmap aggregation matches the dashboard (query.ts
   JS-side): weekday x local hour, tokens = input + cache write + cache read
   + output + reasoning; tz offset = local - UTC minutes (Beijing +480),
   clamped and inlined per filters.ts (MySQL prepared statements handle
   INTERVAL ? inconsistently). */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";
import { usageDeviceDisplayName } from "./device-label";

type Queryable = Pool | PoolConnection;

export type ProfileUsageTab =
  | "posts"
  | "comments"
  | "works"
  | "usage"
  | "tools"
  | "prefs";

export interface ProfileUsageQueryPlan {
  heatmap: boolean;
  topDimensions: boolean;
}

/* The profile's yearly footprint and full snapshot are shared across tabs
   and always fetched by the caller. Only plan queries here that serve one
   specific tab, so pages that never render them (posts, comments, works)
   don't pay for the reads. */
export function profileUsageQueryPlan(
  activeTab: ProfileUsageTab,
  usageVisible: boolean,
): ProfileUsageQueryPlan {
  return {
    heatmap: usageVisible && (activeTab === "usage" || activeTab === "prefs"),
    topDimensions: usageVisible && activeTab === "prefs",
  };
}

/* Same range as clampTzOffset in filters.ts. */
function clampTz(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(840, Math.max(-720, Math.trunc(parsed)));
}

/* ---- opt-in status ---- */

export function socialOptInQuery(userId: number): { sql: string; args: number[] } {
  return {
    sql: "SELECT show_on_leaderboard FROM usage_settings WHERE user_id = ? LIMIT 1",
    args: [userId],
  };
}

/* Whether the user publishes aggregated usage. No settings row = column
   default 0 = private (deny by default). */
export async function isUsagePublic(
  userId: number,
  db: Queryable = getPool(),
): Promise<boolean> {
  const q = socialOptInQuery(userId);
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  return !!rows[0]?.show_on_leaderboard;
}

/* ---- Profile heatmap (weekday x hour token totals, all time) ----
   WEEKDAY() Monday=0, same as the dashboard's JS (getUTCDay()+6)%7;
   HOUR() = local hour. */

export function socialHeatmapQuery(
  userId: number,
  tzOffsetMinutes: number,
): { sql: string; args: number[] } {
  const local = `DATE_ADD(bucket_start, INTERVAL ${clampTz(tzOffsetMinutes)} MINUTE)`;
  return {
    sql: `SELECT WEEKDAY(${local}) AS wd, HOUR(${local}) AS hr,
                 SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens
                     + output_tokens + reasoning_output_tokens) AS tokens
          FROM usage_buckets
          WHERE user_id = ?
          GROUP BY wd, hr`,
    args: [userId],
  };
}

/* Aggregate rows -> the 7x24 grid (Monday-first); out-of-range rows
   ignored. */
export function heatmapGridFromRows(rows: RowDataPacket[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) {
    const wd = Number(r.wd);
    const hr = Number(r.hr);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) continue;
    if (!Number.isInteger(hr) || hr < 0 || hr > 23) continue;
    grid[wd][hr] += Number(r.tokens) || 0;
  }
  return grid;
}

/* The visibility gate lives on the page side (called only for the owner or
   when isUsagePublic holds); this function only fetches. */
export async function getSocialUsageHeatmap(
  userId: number,
  tzOffsetMinutes: number,
  db: Queryable = getPool(),
): Promise<number[][]> {
  const q = socialHeatmapQuery(userId, tzOffsetMinutes);
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  return heatmapGridFromRows(rows);
}

/* ---- Profile yearly build footprint: daily token totals for the last
   371 days (53 weeks). Day grain = the user's local calendar day (DATE
   shifted by the tz offset, same clamped-inline convention as the heatmap);
   window = local today minus 370 days inclusive, SUM of tokens only. */

export function socialDailyActivityQuery(
  userId: number,
  tzOffsetMinutes: number,
): { sql: string; args: number[] } {
  const tz = clampTz(tzOffsetMinutes);
  const local = `DATE_ADD(bucket_start, INTERVAL ${tz} MINUTE)`;
  const localToday = `DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${tz} MINUTE))`;
  return {
    sql: `SELECT DATE(${local}) AS day,
                 SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens
                     + output_tokens + reasoning_output_tokens) AS tokens
          FROM usage_buckets
          WHERE user_id = ?
            AND ${local} >= DATE_SUB(${localToday}, INTERVAL 370 DAY)
          GROUP BY day
          ORDER BY day`,
    args: [userId],
  };
}

/* DATE() under mysql2 may arrive as string or Date (pool timezone:'Z' ->
   UTC midnight); normalize to YYYY-MM-DD. */
function dayKey(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return null;
}

/* The visibility gate lives on the page side (owner or opt-in); this
   function only fetches. Returns YYYY-MM-DD -> tokens for that day; grid
   assembly lives in year-grid.ts. */
export async function getSocialDailyActivity(
  userId: number,
  tzOffsetMinutes: number,
  db: Queryable = getPool(),
): Promise<Record<string, number>> {
  const q = socialDailyActivityQuery(userId, tzOffsetMinutes);
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  const days: Record<string, number> = {};
  for (const r of rows) {
    const key = dayKey(r.day);
    if (key) days[key] = Number(r.tokens) || 0;
  }
  return days;
}

/* ---- Work badges: a set of authors -> all-time token totals (SUM only).
   The opt-in gate is pinned inside the SQL JOIN: private authors never
   appear in the result set, so even a page-assembly bug cannot leak their
   numbers. One batched query avoids N+1. */

export function socialTokenTotalsQuery(
  userIds: (number | null)[],
): { sql: string; args: unknown[] } | null {
  const ids = [
    ...new Set(
      userIds.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0),
    ),
  ];
  if (ids.length === 0) return null;
  return {
    sql: `SELECT b.user_id,
                 SUM(b.input_tokens + b.cache_write_input_tokens + b.cache_read_input_tokens
                     + b.output_tokens + b.reasoning_output_tokens) AS total_tokens
          FROM usage_buckets b
          JOIN usage_settings s
            ON s.user_id = b.user_id AND s.show_on_leaderboard = 1
          WHERE b.user_id IN (?)
          GROUP BY b.user_id`,
    args: [ids],
  };
}

export async function getPublicTokenTotals(
  userIds: (number | null)[],
  db: Queryable = getPool(),
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const q = socialTokenTotalsQuery(userIds);
  if (!q) return map;
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  for (const r of rows) map.set(Number(r.user_id), Number(r.total_tokens) || 0);
  return map;
}

/* ---- Profile "build preferences": the device and project with the most
   all-time tokens. Visibility gate on the page side (owner or opt-in);
   projects have data only if the user enabled uploading project directory
   names; null means the caller omits the row (no negative signaling). */

export async function getSocialTopDimensions(
  userId: number,
  db: Queryable = getPool(),
): Promise<{ topDevice: string | null; topProject: string | null }> {
  const tokenSum = `SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens
                     + output_tokens + reasoning_output_tokens)`;
  const [deviceRows] = await db.query<RowDataPacket[]>(
    `SELECT d.name, d.terminal_name, d.os_name, d.surface, d.platform,
            ${tokenSum} AS tokens
     FROM usage_buckets b
     JOIN usage_devices d ON d.id = b.device_id
     WHERE b.user_id = ?
     GROUP BY b.device_id
     ORDER BY tokens DESC
     LIMIT 1`,
    [userId],
  );
  const [projectRows] = await db.query<RowDataPacket[]>(
    `SELECT project_label AS project, ${tokenSum} AS tokens
     FROM usage_buckets
     WHERE user_id = ? AND project_label IS NOT NULL AND project_label <> ''
     GROUP BY project_label
     ORDER BY tokens DESC
     LIMIT 1`,
    [userId],
  );
  const device = deviceRows[0];
  return {
    topDevice: device
      ? usageDeviceDisplayName({
          name: device.name,
          terminalName: device.terminal_name,
          osName: device.os_name,
          surface: device.surface,
          platform: device.platform,
        })
      : null,
    topProject: projectRows[0]?.project ? String(projectRows[0].project) : null,
  };
}
