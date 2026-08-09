/* 用量社交面(S2-2):个人主页分时热图 + 作品「已验证构建投入」徽章。
   隐私门禁:两者都只消费 usage_settings.show_on_leaderboard(P1-1 自愿公开开关,
   DEFAULT 0 = 不公开;该列由榜单任务引入,settings.ts 的读写不归本文件管)。
   未 opt-in 一律视为无数据,调用方不渲染任何标记(无负面标记原则)。
   热图聚合口径对齐用量看板(query.ts 的 JS 侧聚合):星期×本地小时,
   token = 输入+缓存写+缓存读+输出+推理;时区偏移为「本地 − UTC」分钟数(北京 +480),
   按 filters.ts 的约定夹取后内联进 SQL(MySQL 预备语句对 INTERVAL ? 支持不稳)。 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";

type Queryable = Pool | PoolConnection;

/* 与 filters.ts clampTzOffset 同区间。 */
function clampTz(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(840, Math.max(-720, Math.trunc(parsed)));
}

/* ---- opt-in 状态 ---- */

export function socialOptInQuery(userId: number): { sql: string; args: number[] } {
  return {
    sql: "SELECT show_on_leaderboard FROM usage_settings WHERE user_id = ? LIMIT 1",
    args: [userId],
  };
}

/* 该用户是否自愿公开聚合用量。无设置行 = 走列默认 0 = 不公开(deny by default)。 */
export async function isUsagePublic(
  userId: number,
  db: Queryable = getPool(),
): Promise<boolean> {
  const q = socialOptInQuery(userId);
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  return !!rows[0]?.show_on_leaderboard;
}

/* ---- 个人主页分时热图(星期×小时 token 总量,全部时间) ----
   WEEKDAY() 周一=0,与看板 JS 侧 (getUTCDay()+6)%7 同口径;HOUR() = 本地小时。 */

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

/* 聚合行 → 7×24 网格(周一起);越界行忽略。 */
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

/* 可见性门禁在页面侧(仅本人或 isUsagePublic 为真才调用),本函数只管取数。 */
export async function getSocialUsageHeatmap(
  userId: number,
  tzOffsetMinutes: number,
  db: Queryable = getPool(),
): Promise<number[][]> {
  const q = socialHeatmapQuery(userId, tzOffsetMinutes);
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  return heatmapGridFromRows(rows);
}

/* ---- 个人主页年度构建足迹:最近 371 天(53 周)按日 token 总量 ----
   日粒度 = 用户本地日历日(DATE 按 tz 偏移换算,与分时热图同一套夹取内联约定);
   窗口 = 本地今天往前 370 天,含今天共 371 天,只 SUM tokens,无其他维度。 */

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

/* DATE() 在 mysql2 下可能落 string 也可能落 Date(池端 timezone:'Z' → UTC 零点),
   统一归一成 YYYY-MM-DD。 */
function dayKey(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return null;
}

/* 可见性门禁在页面侧(仅本人或 isUsagePublic 为真才调用),本函数只管取数。
   返回 YYYY-MM-DD → 当天 tokens 的映射,网格组装见 year-grid.ts。 */
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

/* ---- 作品徽章:一组作者 → 各自全部时间 token 总量(只 SUM,无其他维度) ----
   opt-in 门禁钉在 SQL JOIN 里:未公开的作者根本不会出现在结果集,
   即使页面组装出纰漏也漏不出数字。批量一条查询,避免 N+1。 */

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
