/* Login sessions: server-side registry (user_sessions) keyed by a
   random token's HMAC-SHA256 hash — the plaintext exists only in the
   httpOnly cookie, same convention as password_reset_tokens. The old
   stateless signed-uid cookie could not support a device list,
   per-device revoke, "log out everywhere", or kicking other sessions
   after a password/email change, so the registry replaced it
   (20260915). getSessionUser already did one DB read per request; the
   registry turns that read into the session check at no extra cost.
   last_seen_at updates are throttled (≥10 min staleness) so reads stay
   read-mostly; expired rows (last_seen + TTL) are lazily GC'd at each
   login. */
import { createHmac, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";

const COOKIE = "kb_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
const TTL_MS = SESSION_TTL_SECONDS * 1000;
/* last_seen write throttle: below this staleness the read carries no
   UPDATE (a hot tab refreshing every few seconds stays read-only). */
const LAST_SEEN_WRITE_MS = 10 * 60 * 1000;

export interface SessionUser {
  id: number;
  handle: string;
  name: string;
  avatarUrl: string;
  locale: string;
  role: string;
  aiRepliesEnabled: boolean;
  showAiReplies: boolean;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/* Domain-separated hash ("session\0..."): the same AUTH_SECRET also
   signs reset/email tokens; distinct domains keep tokens
   non-interchangeable. */
export function hashSessionToken(token: string): string {
  return createHmac("sha256", secret())
    .update(`session\0${token}`, "utf8")
    .digest("hex");
}

export function isSessionTokenFormat(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/* Device label for the settings session list: neutral English
   "Browser · OS", derived without a UA-parsing dependency (top browsers
   only; anything else reads "Browser"). */
export function summarizeUserAgent(uaRaw: string | null | undefined): string {
  const ua = String(uaRaw ?? "");
  if (!ua) return "Unknown device";
  const os =
    /Windows NT/i.test(ua) ? "Windows" :
    /iPhone/i.test(ua) ? "iPhone" :
    /iPad/i.test(ua) ? "iPad" :
    /Android/i.test(ua) ? "Android" :
    /Mac OS X/i.test(ua) ? "macOS" :
    /CrOS/i.test(ua) ? "ChromeOS" :
    /Linux/i.test(ua) ? "Linux" : "";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" : "";
  if (!os && !browser) return "Unknown device";
  return browser && os ? `${browser} · ${os}` : browser || os;
}

async function readCookieToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

async function setCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

async function clearCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/* The three below may write cookies/rows only in Route Handlers /
   Server Actions; pages read only. */

/* Login: mint a session row + set the cookie. The device label comes
   from the request's User-Agent (the caller never passes it). Lazy GC:
   rows idle past the TTL die with this login, not with a cron. */
export async function setSessionCookie(uid: number): Promise<void> {
  const pool = getPool();
  await pool.query(
    "DELETE FROM user_sessions WHERE last_seen_at < TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP())",
    [-SESSION_TTL_SECONDS - 3600],
  );
  const token = randomBytes(32).toString("hex");
  const h = await headers();
  await pool.query(
    "INSERT INTO user_sessions (user_id, token_hash, ua) VALUES (?, ?, ?)",
    [uid, hashSessionToken(token), summarizeUserAgent(h.get("user-agent"))],
  );
  await setCookie(token);
}

/* Token lookup is separate from request-cookie access so the database
   session contract can be integration-tested directly. Expiry is
   enforced here, not only by browser cookie eviction or opportunistic
   login-time garbage collection. */
export async function getSessionUserForToken(token: string): Promise<SessionUser | null> {
  if (!isSessionTokenFormat(token)) return null;
  try {
    const hash = hashSessionToken(token);
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.handle, u.name, u.avatar_url, u.locale, u.role,
              u.ai_replies_enabled, u.show_ai_replies,
              s.last_seen_at,
              TIMESTAMPDIFF(SECOND, s.last_seen_at, UTC_TIMESTAMP()) AS idle_seconds
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND u.deleted_at IS NULL
         AND s.last_seen_at > TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP())
       LIMIT 1`,
      [hash, -SESSION_TTL_SECONDS],
    );
    const r = rows[0];
    if (!r) return null;
    /* Throttled presence write; failures never break the request. */
    if (Number(r.idle_seconds) * 1000 > LAST_SEEN_WRITE_MS) {
      void pool
        .query("UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP() WHERE token_hash = ?", [hash])
        .catch(() => {});
    }
    return {
      id: Number(r.id),
      handle: r.handle,
      name: r.name,
      avatarUrl: r.avatar_url,
      locale: r.locale,
      role: r.role,
      aiRepliesEnabled: !!r.ai_replies_enabled,
      showAiReplies: !!r.show_ai_replies,
    };
  } catch (e) {
    console.error("getSessionUserForToken: db lookup failed", e);
    return null;
  }
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readCookieToken();
  return token ? getSessionUserForToken(token) : null;
});

export interface SessionRow {
  id: number;
  ua: string;
  createdAt: Date;
  lastSeenAt: Date;
  current: boolean;
}

/* Device list for the settings account tab; the current cookie marks
   its own row. */
export async function listSessions(userId: number): Promise<SessionRow[]> {
  const token = await readCookieToken();
  const currentHash = token ? hashSessionToken(token) : "";
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, ua, created_at, last_seen_at, token_hash
     FROM user_sessions
     WHERE user_id = ?
       AND last_seen_at > TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP())
     ORDER BY last_seen_at DESC LIMIT 50`,
    [userId, -SESSION_TTL_SECONDS],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    ua: String(r.ua || "Unknown device"),
    createdAt: new Date(r.created_at),
    lastSeenAt: new Date(r.last_seen_at),
    current: r.token_hash === currentHash,
  }));
}

/* Logout: kill this session's row + cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const token = await readCookieToken();
  if (token) await destroySessionToken(token);
  await clearCookie();
}

/* Route handlers that construct their own response can revoke the row
   from the request cookie, then delete the cookie on that response. */
export async function destroySessionToken(token: string): Promise<boolean> {
  if (!isSessionTokenFormat(token)) return false;
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM user_sessions WHERE token_hash = ?",
    [hashSessionToken(token)],
  );
  return res.affectedRows > 0;
}

/* "Log out everywhere": all devices including the current one (the
   caller then lands the visitor as anonymous). Also the hammer for
   security-sensitive flips. Returns the removed count. */
export async function destroyAllSessions(userId: number): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM user_sessions WHERE user_id = ?",
    [userId],
  );
  await clearCookie();
  return res.affectedRows;
}

/* Keep-this-device variant: password/email changes revoke every OTHER
   session. */
export async function destroyOtherSessions(userId: number): Promise<number> {
  const token = await readCookieToken();
  const currentHash = token ? hashSessionToken(token) : "";
  const [res] = await getPool().query<ResultSetHeader>(
    "DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?",
    [userId, currentHash],
  );
  return res.affectedRows;
}

/* Revoke one other device from the settings list (never the current
   row — that's what logout is for). */
export async function revokeSession(
  userId: number,
  sessionId: number,
): Promise<boolean> {
  const token = await readCookieToken();
  const currentHash = token ? hashSessionToken(token) : "";
  const [res] = await getPool().query<ResultSetHeader>(
    `DELETE FROM user_sessions
     WHERE id = ? AND user_id = ? AND token_hash != ?`,
    [sessionId, userId, currentHash],
  );
  return res.affectedRows > 0;
}
