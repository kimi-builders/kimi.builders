/* Error observability: validation + sanitization for client/server
   error reports, the CSP report channel, and the 24h digest decision.
   Pure functions at the top (unit-tested); the DB insert and digest
   queries sit at the bottom. Storage is intentionally minimal — no raw
   IP, truncated UA, capped field lengths — matching the site's
   collect-little privacy stance. */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";

export const ERROR_SOURCES = ["client", "server", "global", "csp"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

export const ERROR_MESSAGE_MAX = 500;
export const ERROR_URL_MAX = 500;
export const ERROR_RELEASE_MAX = 64;
export const ERROR_USER_AGENT_MAX = 200;
export const ERROR_STACK_MAX = 8000;
export const ERROR_BODY_MAX_BYTES = 16 * 1024;

export interface ErrorReportInput {
  source?: unknown;
  message?: unknown;
  url?: unknown;
  release?: unknown;
  stack?: unknown;
}

export interface ErrorReportRow {
  source: ErrorSource;
  message: string;
  url: string;
  release: string;
  stack: string | null;
}

/* Coerce + cap a single field; non-strings become "". */
function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

export function isErrorSource(v: unknown): v is ErrorSource {
  return (ERROR_SOURCES as readonly unknown[]).includes(v);
}

/* Validate + sanitize an error report. Invalid source or an empty
   message rejects (null); everything else is capped, never rejected —
   an error reporter must not become a second source of errors. */
export function parseErrorReport(input: ErrorReportInput): ErrorReportRow | null {
  if (!isErrorSource(input.source)) return null;
  const message = cleanString(input.message, ERROR_MESSAGE_MAX);
  if (!message) return null;
  const stack = cleanString(input.stack, ERROR_STACK_MAX);
  return {
    source: input.source,
    message,
    url: cleanString(input.url, ERROR_URL_MAX),
    release: cleanString(input.release, ERROR_RELEASE_MAX),
    stack: stack ? stack : null,
  };
}

/* CSP reports arrive in three shapes: the legacy `csp-report` object,
   the Reporting API `body` envelope, and the reports+json ARRAY of
   envelopes (one row per report; the first entry carries the violation
   that fired the delivery). Extract a single message line. */
export function parseCspReport(input: unknown): ErrorReportRow | null {
  if (Array.isArray(input)) return parseCspReport(input[0]);
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  const legacy = obj["csp-report"];
  const body = obj.body;
  const report =
    typeof legacy === "object" && legacy !== null
      ? (legacy as Record<string, unknown>)
      : typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : null;
  if (!report) return null;
  const directive = cleanString(report["blocked-uri"] ?? report.blockedURI, 200);
  const violated = cleanString(report["violated-directive"] ?? report["effective-directive"], 120);
  const doc = cleanString(report["document-uri"] ?? report.documentURL, ERROR_URL_MAX);
  const parts = [violated ? `directive: ${violated}` : "", directive && directive !== "inline" ? `blocked: ${directive}` : "", doc ? `at: ${doc}` : ""].filter(Boolean);
  const message = parts.length ? `CSP ${parts.join(" | ")}` : "CSP report";
  return {
    source: "csp",
    message: message.slice(0, ERROR_MESSAGE_MAX),
    url: doc.slice(0, ERROR_URL_MAX),
    release: "",
    stack: null,
  };
}

/* Rough fingerprint for grouping duplicate reports client-side
   (message prefix + stack head). Not cryptographic. */
export function errorFingerprint(row: ErrorReportRow): string {
  const head = row.stack ? row.stack.split("\n").slice(0, 2).join("|") : "";
  return `${row.source}#${row.message.slice(0, 80)}#${head.slice(0, 120)}`;
}

/* ---- 24h digest decision (pure) ---- */

export const ERROR_DIGEST_THRESHOLD = 20;

export interface ErrorDigestStats {
  total: number;
  topMessage: string | null;
  topCount: number;
}

export interface ErrorDigestDecision {
  alert: boolean;
}

/* Alert when 24h volume crosses the threshold. A digest that stays
   quiet on a healthy site is the success state. */
export function shouldAlertErrorDigest(stats: ErrorDigestStats): ErrorDigestDecision {
  return { alert: stats.total >= ERROR_DIGEST_THRESHOLD };
}

/* ---- DB writes/reads (bottom) ---- */

export async function insertErrorEvent(
  row: ErrorReportRow,
  opts: { userId?: number | null; userAgent?: string } = {},
  db: Pool = getPool(),
): Promise<void> {
  await db.execute(
    "INSERT INTO error_events (source, `release`, url, message, stack, user_id, user_agent)\n     VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      row.source,
      row.release,
      row.url,
      row.message,
      row.stack,
      opts.userId ?? null,
      (opts.userAgent ?? "").slice(0, ERROR_USER_AGENT_MAX),
    ],
  );
}

/* Retention SQL lives in analytics.ts (ERROR_EVENTS_RETENTION_SQL) so
   the daily retention cron deletes every 90-day table in one batch. */

export async function errorDigestStats(
  db: Pool = getPool(),
): Promise<ErrorDigestStats> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM error_events
     WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR`,
  );
  const [top] = await db.query<RowDataPacket[]>(
    `SELECT message, COUNT(*) AS c FROM error_events
     WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR
     GROUP BY message ORDER BY c DESC LIMIT 1`,
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    topMessage: top[0] ? String(top[0].message) : null,
    topCount: top[0] ? Number(top[0].c) : 0,
  };
}
