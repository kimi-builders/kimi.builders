/* One-time password-reset tokens: the 64-hex random plaintext exists
   only in the email; the database stores HMAC-SHA256 (signed with
   AUTH_SECRET, same key convention as session.ts). Issuing a new token
   invalidates old ones (all the user's unused tokens get used_at);
   consumption is a single atomic UPDATE (hits only if present, unused,
   unexpired, and sets used_at) — replay-proof and concurrency-proof. */
import { createHmac, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";

export const RESET_TOKEN_TTL_HOURS = 1;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function isResetTokenFormat(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

export function hashResetToken(token: string): string {
  return createHmac("sha256", secret())
    .update(`password-reset\0${token}`, "utf8")
    .digest("hex");
}

/* Invalidate old tokens + issue a new one; returns the plaintext (goes
   into the email link only, never stored). */
export async function issuePasswordResetToken(userId: number): Promise<string> {
  const pool = getPool();
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP()
     WHERE user_id = ? AND used_at IS NULL`,
    [userId],
  );
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, TIMESTAMPADD(HOUR, ?, UTC_TIMESTAMP()))`,
    [userId, hashResetToken(token), RESET_TOKEN_TTL_HOURS],
  );
  return token;
}

/* Atomic consumption: valid (present/unused/unexpired) -> set used_at
   and return the userId; otherwise null. Failure reasons (missing/
   expired/used) are indistinguishable to callers — always invalid_token. */
export async function consumePasswordResetToken(token: string): Promise<number | null> {
  if (!isResetTokenFormat(token)) return null;
  const pool = getPool();
  const hash = hashResetToken(token);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP()
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [hash],
  );
  if (res.affectedRows !== 1) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id FROM password_reset_tokens WHERE token_hash = ? LIMIT 1",
    [hash],
  );
  return rows[0] ? Number(rows[0].user_id) : null;
}
