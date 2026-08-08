/* 登录会话:无服务端状态的签名 cookie(HMAC-SHA256,AUTH_SECRET 签名)。
   格式 base64url({uid,exp}).base64url(sig),httpOnly + sameSite=lax,30 天。
   小社区够用;要支持强制下线再换 sessions 表。 */
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

/* 以下三个只能在 Route Handler / Server Action 里写 cookie;页面里只读。 */

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

/* React cache():同一请求里 Header / 页面 / 表单多处调用只查一次库。 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  let uid: number | null;
  try {
    uid = verifySessionToken(token);
  } catch {
    return null; // AUTH_SECRET 未配置时按未登录处理,不拖垮页面
  }
  if (!uid) return null;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT id, handle, name, avatar_url, locale, role,
              ai_replies_enabled, show_ai_replies
       FROM users WHERE id = ? LIMIT 1`,
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
