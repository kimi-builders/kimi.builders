/* Error observability: validation + sanitization for client error
   reports, the CSP report channel, and the daily digest decision.
   Pure functions at the top (unit-tested); the DB insert and digest
   queries sit at the bottom. Storage is intentionally minimal — no raw
   IP or account id, truncated UA, capped/redacted fields — matching the
   site's collect-little privacy stance. */
import { createHash } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";

export const ERROR_SOURCES = ["client", "global", "csp"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];
const CLIENT_ERROR_SOURCES = ["client", "global"] as const;

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
  stack?: unknown;
}

export interface ErrorReportRow {
  source: ErrorSource;
  message: string;
  url: string;
  stack: string | null;
}

export interface ErrorDigestWindow {
  key: string;
  start: Date;
  end: Date;
}

/* Coerce + cap a single field; non-strings become "". */
function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/* Error text can contain request URLs or copied API errors. Redact the
   credential-shaped fragments that must never become long-lived
   observability data or leave the server in a digest email. */
export function redactErrorText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(
      /([?&](?:token|code|state|password|secret|api[_-]?key)=)[^&#\s)]+/gi,
      "$1[redacted]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .slice(0, max);
}

/* Store only a path. Query strings can carry password-reset tokens,
   OAuth state, search text, or other private input; fragments add no
   diagnostic value. Absolute CSP document URLs and client paths share
   this one server-side boundary. */
export function sanitizeObservedPath(value: unknown): string {
  const raw = cleanString(value, 2048);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://kimi.builders");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return cleanString(parsed.pathname || "/", ERROR_URL_MAX);
  } catch {
    return "";
  }
}

function sanitizeCspResource(value: unknown): string {
  const raw = cleanString(value, 1000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return redactErrorText(raw, 200);
    }
    return cleanString(`${parsed.origin}${parsed.pathname}`, 200);
  } catch {
    return redactErrorText(raw, 200);
  }
}

export function isErrorSource(v: unknown): v is ErrorSource {
  return (ERROR_SOURCES as readonly unknown[]).includes(v);
}

/* Validate + sanitize an error report. Invalid source or an empty
   message rejects (null); everything else is capped, never rejected —
   an error reporter must not become a second source of errors. */
export function parseErrorReport(input: ErrorReportInput): ErrorReportRow | null {
  if (!(CLIENT_ERROR_SOURCES as readonly unknown[]).includes(input.source)) return null;
  const message = redactErrorText(input.message, ERROR_MESSAGE_MAX);
  if (!message) return null;
  const stack = redactErrorText(input.stack, ERROR_STACK_MAX);
  return {
    source: input.source as (typeof CLIENT_ERROR_SOURCES)[number],
    message,
    url: sanitizeObservedPath(input.url),
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
  const directive = sanitizeCspResource(
    report["blocked-uri"] ?? report.blockedURI ?? report.blockedURL,
  );
  const violated = cleanString(report["violated-directive"] ?? report["effective-directive"], 120);
  const doc = sanitizeObservedPath(report["document-uri"] ?? report.documentURL);
  const parts = [violated ? `directive: ${violated}` : "", directive && directive !== "inline" ? `blocked: ${directive}` : "", doc ? `at: ${doc}` : ""].filter(Boolean);
  const message = parts.length ? `CSP ${parts.join(" | ")}` : "CSP report";
  return {
    source: "csp",
    message: message.slice(0, ERROR_MESSAGE_MAX),
    url: doc,
    stack: null,
  };
}

/* Stable server-side fingerprint for grouping repeated reports in the
   digest. Release stays in the key so a regression after deploy does
   not merge with an older build's failure. */
export function errorFingerprint(row: ErrorReportRow, release: string): string {
  const head = row.stack ? row.stack.split("\n").slice(0, 2).join("\n") : "";
  return createHash("sha256")
    .update(
      `${row.source}\0${release}\0${row.message.slice(0, 80)}\0${head.slice(0, 120)}`,
    )
    .digest("hex");
}

/* ---- Daily digest decision (pure) ---- */

export const ERROR_DIGEST_THRESHOLD = 20;

export interface ErrorDigestStats {
  total: number;
  topSource: ErrorSource | null;
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

/* Use the previous completed UTC day rather than a rolling 24-hour
   window. Retries then read an immutable event set and can safely reuse
   one provider idempotency key per recipient. */
export function previousUtcDayWindow(now = new Date()): ErrorDigestWindow {
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(endMs - 24 * 60 * 60 * 1000);
  return {
    key: start.toISOString().slice(0, 10),
    start,
    end: new Date(endMs),
  };
}

/* ---- DB writes/reads (bottom) ---- */

export async function insertErrorEvent(
  row: ErrorReportRow,
  opts: { userAgent?: string; release?: string } = {},
  db: Pool = getPool(),
): Promise<void> {
  const release =
    cleanString(
      opts.release ?? process.env.DEPLOYMENT_VERSION ?? "development",
      ERROR_RELEASE_MAX,
    ) || "development";
  await db.execute(
    "INSERT INTO error_events (source, `release`, fingerprint, url, message, stack, user_agent)\n     VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      row.source,
      release,
      errorFingerprint(row, release),
      row.url,
      row.message,
      row.stack,
      (opts.userAgent ?? "").slice(0, ERROR_USER_AGENT_MAX),
    ],
  );
}

/* Retention SQL lives in analytics.ts (ERROR_EVENTS_RETENTION_SQL) so
   the daily retention cron deletes every 90-day table in one batch. */

export async function errorDigestStats(
  window: ErrorDigestWindow = previousUtcDayWindow(),
  db: Pool = getPool(),
): Promise<ErrorDigestStats> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM error_events
     WHERE created_at >= ? AND created_at < ?`,
    [window.start, window.end],
  );
  const [top] = await db.query<RowDataPacket[]>(
    `SELECT MIN(source) AS source, MIN(message) AS message, COUNT(*) AS c
     FROM error_events
     WHERE created_at >= ? AND created_at < ?
     GROUP BY fingerprint ORDER BY c DESC, fingerprint ASC LIMIT 1`,
    [window.start, window.end],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    topSource: top[0] && isErrorSource(top[0].source) ? top[0].source : null,
    topMessage: top[0] ? String(top[0].message) : null,
    topCount: top[0] ? Number(top[0].c) : 0,
  };
}
