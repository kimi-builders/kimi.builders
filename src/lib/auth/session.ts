/* Login sessions: stateless signed cookies (HMAC-SHA256, signed with
   AUTH_SECRET). Format base64url({uid,exp}).base64url(sig), httpOnly +
   sameSite=lax, 30 days. Enough for a small community; move to a sessions
   table if forced logout is ever required. */
import { createHmac, timingSafeEqual } from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";

const COOKIE = "kb_session";
const TTL_MS = 30 * 24 * 3600 * 1000;

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

export function createSessionToken(uid: number, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: now + TTL_MS }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): number | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = token.slice(0, i);
  const expected = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: number;
      exp?: number;
    };
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

/* The three below may write cookies only in Route Handlers / Server
   Actions; pages read only. */

export async function setSessionCookie(uid: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, createSessionToken(uid), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

/* React cache(): Header / page / form calls within one request hit the
   DB once. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  let uid: number | null;
  try {
    uid = verifySessionToken(token);
  } catch {
    return null; // unset AUTH_SECRET treats as logged out, never breaks
                  // the page
  }
  if (!uid) return null;
  try {
    /* deleted_at gate: soft-deleted accounts are logged out everywhere
       at once (stateless cookie + this one filter) and can never obtain
       a working session again. */
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id, handle, name, avatar_url, locale, role,
              ai_replies_enabled, show_ai_replies
       FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [uid],
    );
    const r = rows[0];
    if (!r) return null;
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
    console.error("getSessionUser: db lookup failed", e);
    return null;
  }
});
