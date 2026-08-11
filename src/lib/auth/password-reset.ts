/* 忘记密码的一次性重置 token:64 位 hex 随机明文只进邮件,
   库中只存 HMAC-SHA256(AUTH_SECRET 签名,与 session.ts 同一密钥惯例)。
   签发新作废旧(同用户未用 token 全部置 used_at);
   消费是单条原子 UPDATE(存在/未用/未过期才命中并置 used_at),防重放防并发双用。 */
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

/* 作废旧 token + 签发新 token;返回明文(只拼进邮件链接,不落库)。 */
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

/* 原子消费:有效(存在/未用/未过期)→ 置 used_at 并返回 userId;否则 null。
   无效原因(不存在/过期/已用)对外不区分,统一 invalid_token。 */
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
