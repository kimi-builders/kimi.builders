/* 用户落库:oauth_accounts 命中 → 返回既有 user_id;
   未命中 → 建新 users 行(handle 去重)+ 绑定 oauth_accounts。
   不按邮箱自动并号(防撞号);同人多绑留到设置页再做。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { getPool } from "../db";
import type { OAuthProfile, Provider } from "./oauth";

export async function findOrCreateUser(
  provider: Provider,
  profile: OAuthProfile,
): Promise<number> {
  const pool = getPool();
  const [linked] = await pool.query<RowDataPacket[]>(
    "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ? LIMIT 1",
    [provider, profile.providerAccountId],
  );
  if (linked[0]) return Number(linked[0].user_id);

  const handle = await uniqueHandle(pool, profile.handle || profile.name || "builder");
  const [res] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (handle, name, email, avatar_url) VALUES (?, ?, ?, ?)",
    [handle, profile.name.slice(0, 64), profile.email, profile.avatarUrl.slice(0, 500)],
  );
  const uid = Number(res.insertId);
  await pool.query(
    "INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES (?, ?, ?)",
    [uid, provider, profile.providerAccountId],
  );
  return uid;
}

export async function setUserLocale(
  userId: number,
  locale: "zh" | "en",
): Promise<void> {
  await getPool().query("UPDATE users SET locale = ? WHERE id = ?", [
    locale,
    userId,
  ]);
}

function sanitizeHandle(raw: string): string {
  const h = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  return h || "builder";
}

async function uniqueHandle(pool: Pool, raw: string): Promise<string> {
  const base = sanitizeHandle(raw);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}_${i + 1}`;
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE handle = ? LIMIT 1",
      [candidate],
    );
    if (!rows[0]) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}
