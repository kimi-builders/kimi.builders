/* Position-value analytics v1: event counts and per-day deduplicated
   visitor HMACs only. Same privacy posture as the usage module: counts
   only — no user_id, full URLs, referrers, raw IPs, raw User-Agents,
   conversation content, full paths, or credentials. */
import { createHmac } from "node:crypto";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { trustedClientIp } from "./client-ip";
import { getPool } from "./db";

type Queryable = Pool | PoolConnection;

export const EVENTS = [
  "home_view",
  "leaderboard_view",
  "awesome_view",
  "works_view",
  "usage_view",
  "post_view",
  "work_view",
  "profile_view",
  "profile_tab_view",
  "featured_click",
  "poster_download",
  "join_click",
] as const;

export type AnalyticsEvent = (typeof EVENTS)[number];
export type AnalyticsPeriod = "7d" | "30d";
export type AnalyticsMeta = Record<string, string>;

export interface AnalyticsEventPayload {
  event: AnalyticsEvent;
  target_kind: string;
  target_id: string;
  meta: AnalyticsMeta | null;
}

type EventRule = {
  targetKinds: readonly string[];
  targetIds?: readonly string[];
  idShape?: "numeric" | "handle";
  meta?: Readonly<Record<string, readonly string[]>>;
  matchMetaToTarget?: string;
};

const PROFILE_TABS = ["posts", "comments", "works", "usage", "tools", "prefs"] as const;
const POSTER_SURFACES = ["profile", "post", "work", "usage"] as const;
const JOIN_SLOTS = ["org", "awesome", "mail"] as const;

export const ANALYTICS_EVENT_RULES: Record<AnalyticsEvent, EventRule> = {
  home_view: { targetKinds: ["page"], targetIds: ["home"] },
  leaderboard_view: { targetKinds: ["page"], targetIds: ["leaderboard"] },
  awesome_view: { targetKinds: ["page"], targetIds: ["awesome"] },
  works_view: { targetKinds: ["page"], targetIds: ["works"] },
  usage_view: { targetKinds: ["page"], targetIds: ["usage"] },
  post_view: { targetKinds: ["post"], idShape: "numeric" },
  work_view: { targetKinds: ["work"], idShape: "numeric" },
  profile_view: { targetKinds: ["profile"], idShape: "handle" },
  profile_tab_view: {
    targetKinds: ["profile"],
    idShape: "handle",
    meta: { tab: PROFILE_TABS },
  },
  featured_click: {
    targetKinds: ["post", "work"],
    idShape: "numeric",
    meta: { position: ["home", "rail"] },
  },
  poster_download: {
    targetKinds: ["surface"],
    targetIds: POSTER_SURFACES,
    meta: { surface: POSTER_SURFACES },
    matchMetaToTarget: "surface",
  },
  join_click: {
    targetKinds: ["slot"],
    targetIds: JOIN_SLOTS,
    meta: { slot: JOIN_SLOTS },
    matchMetaToTarget: "slot",
  },
};

export const BEACON_EVENTS = ["featured_click", "poster_download", "join_click"] as const;

const EVENT_SET = new Set<string>(EVENTS);
const BODY_KEYS = new Set(["event", "target_kind", "target_id", "meta"]);
const VALUE_SHAPE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const HANDLE_SHAPE = /^[a-z0-9_]{1,28}$/;
const NUMERIC_ID_SHAPE = /^[1-9][0-9]*$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTargetId(value: string, rule: EventRule): boolean {
  if (!value || value.length > 64) return false;
  if (rule.targetIds && !rule.targetIds.includes(value)) return false;
  if (rule.idShape === "numeric" && !NUMERIC_ID_SHAPE.test(value)) return false;
  if (
    rule.idShape === "handle" &&
    (!HANDLE_SHAPE.test(value) || !/[a-z0-9]/.test(value))
  ) {
    return false;
  }
  if (!rule.idShape && !VALUE_SHAPE.test(value)) return false;
  return true;
}

/* API and server-side collection share one field-by-field validator.
   Unknown root fields, unknown meta keys, non-allowlisted values,
   overlong values, or wrong target combinations are all rejected —
   arbitrary text never reaches the analytics tables. */
export function parseAnalyticsEventPayload(input: unknown): AnalyticsEventPayload | null {
  if (!isPlainRecord(input)) return null;
  if (Object.keys(input).some((key) => !BODY_KEYS.has(key))) return null;
  if (typeof input.event !== "string" || !EVENT_SET.has(input.event)) return null;
  if (typeof input.target_kind !== "string" || typeof input.target_id !== "string") return null;

  const event = input.event as AnalyticsEvent;
  const rule = ANALYTICS_EVENT_RULES[event];
  if (!rule.targetKinds.includes(input.target_kind)) return null;
  if (!validTargetId(input.target_id, rule)) return null;

  const allowedMeta = rule.meta;
  if (!allowedMeta) {
    if (input.meta !== undefined && input.meta !== null) return null;
    return {
      event,
      target_kind: input.target_kind,
      target_id: input.target_id,
      meta: null,
    };
  }
  if (!isPlainRecord(input.meta)) return null;
  const metaKeys = Object.keys(input.meta);
  const allowedKeys = Object.keys(allowedMeta);
  if (
    metaKeys.length !== allowedKeys.length ||
    metaKeys.some((key) => !Object.hasOwn(allowedMeta, key))
  ) {
    return null;
  }
  const meta: AnalyticsMeta = {};
  for (const key of allowedKeys) {
    const value = input.meta[key];
    if (
      typeof value !== "string" ||
      !value ||
      value.length > 32 ||
      !VALUE_SHAPE.test(value) ||
      !allowedMeta[key].includes(value)
    ) {
      return null;
    }
    meta[key] = value;
  }
  if (rule.matchMetaToTarget && meta[rule.matchMetaToTarget] !== input.target_id) return null;
  return {
    event,
    target_kind: input.target_kind,
    target_id: input.target_id,
    meta,
  };
}

type HeaderSource = Request | Headers | { headers: Headers };

function sourceHeaders(source: HeaderSource): Headers {
  return source instanceof Headers ? source : source.headers;
}

function analyticsSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

/* The viewer hash is stable only within one UTC day: inputs change
   prefix across days, so no long-term browsing trail can form. Raw IP/UA
   enter the HMAC in-process only and are never written to tables, logs,
   or responses. */
export function viewerHash(
  source: HeaderSource,
  now: Date = new Date(),
  secret: string = analyticsSecret(),
): string {
  const headers = sourceHeaders(source);
  /* Trusted IP order: shared with rate limiting, see client-ip.ts. */
  const ip = trustedClientIp(headers) ?? "anon";
  const ua = headers.get("user-agent")?.trim() || "anon";
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret)
    .update(`${day}|${ip}|${ua}`)
    .digest("hex");
}

export function isAnalyticsBot(userAgent: string | null): boolean {
  return /(?:googlebot|bingbot|baiduspider|yandexbot|duckduckbot|crawler|spider|slurp|curl|wget|headless|phantomjs|lighthouse)/i.test(
    userAgent ?? "",
  );
}

export interface TrackEventOptions {
  headers: HeaderSource;
  now?: Date;
  db?: Queryable;
}

/* Page rendering must never block on analytics writes: validation, HMAC,
   or DB failures only log. Call sites must live inside page component
   bodies, never inside unstable_cache callbacks. */
export function trackEvent(
  event: AnalyticsEvent,
  target: { kind: string; id: string | number },
  options: TrackEventOptions,
  meta?: AnalyticsMeta,
): void {
  try {
    const payload = parseAnalyticsEventPayload({
      event,
      target_kind: target.kind,
      target_id: String(target.id),
      meta,
    });
    if (!payload) throw new Error(`invalid analytics event: ${event}`);
    const viewer = viewerHash(options.headers, options.now);
    const db = options.db ?? getPool();
    void db
      .query(
        `INSERT INTO analytics_events (event, target_kind, target_id, meta, viewer)
         VALUES (?, ?, ?, ?, ?)`,
        [
          payload.event,
          payload.target_kind,
          payload.target_id,
          payload.meta ? JSON.stringify(payload.meta) : null,
          viewer,
        ],
      )
      .catch((error) => console.error("analytics event write failed", error));
  } catch (error) {
    console.error("analytics event preparation failed", error);
  }
}

const PERIOD_MS: Record<AnalyticsPeriod, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function normalizeAnalyticsPeriod(value: unknown): AnalyticsPeriod {
  return value === "30d" ? "30d" : "7d";
}

export function analyticsCutoff(period: AnalyticsPeriod, now: Date): string {
  return new Date(now.getTime() - PERIOD_MS[period])
    .toISOString()
    .slice(0, 23)
    .replace("T", " ");
}

export interface AnalyticsQuery {
  sql: string;
  params: unknown[];
}

export function buildAnalyticsEventTotalsQuery(
  period: AnalyticsPeriod,
  now: Date,
): AnalyticsQuery {
  return {
    sql: `SELECT event, COUNT(*) AS total, COUNT(DISTINCT viewer) AS unique_viewers
          FROM analytics_events
          WHERE created_at >= ?
          GROUP BY event
          ORDER BY event ASC`,
    params: [analyticsCutoff(period, now)],
  };
}

export function buildFeaturedClickQuery(
  period: AnalyticsPeriod,
  now: Date,
): AnalyticsQuery {
  return {
    sql: `SELECT JSON_UNQUOTE(JSON_EXTRACT(meta, '$.position')) AS position,
                 target_kind, target_id, COUNT(*) AS total,
                 COUNT(DISTINCT viewer) AS unique_viewers
          FROM analytics_events
          WHERE event = 'featured_click' AND created_at >= ?
          GROUP BY position, target_kind, target_id
          ORDER BY position ASC, total DESC, target_kind ASC, target_id ASC`,
    params: [analyticsCutoff(period, now)],
  };
}

export function buildPosterDownloadsQuery(
  period: AnalyticsPeriod,
  now: Date,
): AnalyticsQuery {
  return {
    sql: `SELECT JSON_UNQUOTE(JSON_EXTRACT(meta, '$.surface')) AS surface,
                 COUNT(*) AS total, COUNT(DISTINCT viewer) AS unique_viewers
          FROM analytics_events
          WHERE event = 'poster_download' AND created_at >= ?
          GROUP BY surface
          ORDER BY total DESC, surface ASC`,
    params: [analyticsCutoff(period, now)],
  };
}

export const ANALYTICS_TOP_LIMIT = 10;

export function buildAnalyticsTopTargetsQuery(
  event: "work_view" | "profile_view",
  period: AnalyticsPeriod,
  now: Date,
  limit: number = ANALYTICS_TOP_LIMIT,
): AnalyticsQuery {
  const capped = Math.max(1, Math.min(ANALYTICS_TOP_LIMIT, Math.trunc(limit) || 1));
  return {
    sql: `SELECT target_id, COUNT(*) AS total,
                 COUNT(DISTINCT viewer) AS unique_viewers
          FROM analytics_events
          WHERE event = ? AND created_at >= ?
          GROUP BY target_id
          ORDER BY total DESC, target_id ASC
          LIMIT ${capped}`,
    params: [event, analyticsCutoff(period, now)],
  };
}

const VIEW_EVENTS = EVENTS.filter((event) => event.endsWith("_view"));

export function buildAnalyticsPageViewsQuery(
  period: AnalyticsPeriod,
  now: Date,
): AnalyticsQuery {
  const placeholders = VIEW_EVENTS.map(() => "?").join(", ");
  return {
    sql: `SELECT event, COUNT(*) AS total, COUNT(DISTINCT viewer) AS unique_viewers
          FROM analytics_events
          WHERE event IN (${placeholders}) AND created_at >= ?
          GROUP BY event
          ORDER BY total DESC, event ASC`,
    params: [...VIEW_EVENTS, analyticsCutoff(period, now)],
  };
}

export interface AnalyticsCountRow {
  key: string;
  total: number;
  uniqueViewers: number;
}

export interface FeaturedClickRow extends AnalyticsCountRow {
  position: string;
  targetKind: string;
  targetId: string;
}

export interface AnalyticsInsights {
  eventTotals: AnalyticsCountRow[];
  featuredClicks: FeaturedClickRow[];
  posterDownloads: AnalyticsCountRow[];
  topWorks: AnalyticsCountRow[];
  topProfiles: AnalyticsCountRow[];
  pageViews: AnalyticsCountRow[];
}

function count(value: unknown): number {
  return Number(value ?? 0);
}

export async function getAnalyticsInsights(
  period: AnalyticsPeriod,
  options: { now?: Date; db?: Queryable } = {},
): Promise<AnalyticsInsights> {
  const db = options.db ?? getPool();
  const now = options.now ?? new Date();
  const queries = [
    buildAnalyticsEventTotalsQuery(period, now),
    buildFeaturedClickQuery(period, now),
    buildPosterDownloadsQuery(period, now),
    buildAnalyticsTopTargetsQuery("work_view", period, now),
    buildAnalyticsTopTargetsQuery("profile_view", period, now),
    buildAnalyticsPageViewsQuery(period, now),
  ];
  const [eventResult, featuredResult, posterResult, workResult, profileResult, pageResult] =
    await Promise.all(
      queries.map((query) => db.query<RowDataPacket[]>(query.sql, query.params)),
    );
  const eventRows = eventResult[0];
  const featuredRows = featuredResult[0];
  const posterRows = posterResult[0];
  const workRows = workResult[0];
  const profileRows = profileResult[0];
  const pageRows = pageResult[0];
  const mapCounts = (rows: RowDataPacket[], key: string): AnalyticsCountRow[] =>
    rows.map((row) => ({
      key: String(row[key] ?? ""),
      total: count(row.total),
      uniqueViewers: count(row.unique_viewers),
    }));
  return {
    eventTotals: mapCounts(eventRows, "event"),
    featuredClicks: featuredRows.map((row) => ({
      key: `${row.target_kind}:${row.target_id}`,
      position: String(row.position ?? ""),
      targetKind: String(row.target_kind ?? ""),
      targetId: String(row.target_id ?? ""),
      total: count(row.total),
      uniqueViewers: count(row.unique_viewers),
    })),
    posterDownloads: mapCounts(posterRows, "surface"),
    topWorks: mapCounts(workRows, "target_id"),
    topProfiles: mapCounts(profileRows, "target_id"),
    pageViews: mapCounts(pageRows, "event"),
  };
}

export const ANALYTICS_RETENTION_SQL =
  "DELETE FROM analytics_events WHERE created_at < UTC_TIMESTAMP() - INTERVAL 90 DAY";
export const ANALYTICS_RATE_LIMIT_RETENTION_SQL =
  "DELETE FROM usage_rate_limits WHERE scope = 'analytics-event' AND window_start < UTC_TIMESTAMP() - INTERVAL 90 DAY";

export async function applyAnalyticsRetention(
  db: Queryable = getPool(),
): Promise<{ deleted: number; rateLimitDeleted: number }> {
  const [result] = await db.query<ResultSetHeader>(ANALYTICS_RETENTION_SQL);
  /* identity_hash rows in the rate-limit table are a second HMAC over
     the viewer and obey the same 90-day lifecycle; the scope condition
     keeps this away from auth/community/usage rate-limit rows. */
  const [rateLimitResult] = await db.query<ResultSetHeader>(
    ANALYTICS_RATE_LIMIT_RETENTION_SQL,
  );
  return {
    deleted: result.affectedRows,
    rateLimitDeleted: rateLimitResult.affectedRows,
  };
}
