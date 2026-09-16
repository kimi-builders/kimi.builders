/* Email verification + email-change tokens: the password-reset token
   pattern applied to mailbox ownership. Plaintext exists only in the
   email link; the DB stores a domain-separated HMAC ("email-verify\0…"),
   issuing invalidates the user's older unused tokens of the same
   purpose, and consumption is one atomic UPDATE (present/unused/
   unexpired). purpose=change carries the pending new address so no
   users-column is needed until confirmation. */
import { createHmac, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";

export const EMAIL_TOKEN_TTL_HOURS = 24;
export type EmailTokenPurpose = "verify" | "change";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function isEmailTokenFormat(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

export function hashEmailToken(token: string): string {
  return createHmac("sha256", secret())
    .update(`email-verify\0${token}`, "utf8")
    .digest("hex");
}

/* Invalidate the same-purpose leftovers, then issue. Returns the
   plaintext (email link only). */
export async function issueEmailToken(
  userId: number,
  purpose: EmailTokenPurpose,
  newEmail: string | null = null,
): Promise<string> {
  const pool = getPool();
  await pool.query(
    `UPDATE email_verify_tokens SET used_at = UTC_TIMESTAMP()
     WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
    [userId, purpose],
  );
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO email_verify_tokens (user_id, purpose, new_email, token_hash, expires_at)
     VALUES (?, ?, ?, ?, TIMESTAMPADD(HOUR, ?, UTC_TIMESTAMP()))`,
    [userId, purpose, purpose === "change" ? newEmail : null, hashEmailToken(token), EMAIL_TOKEN_TTL_HOURS],
  );
  return token;
}

export interface ConsumedEmailToken {
  userId: number;
  purpose: EmailTokenPurpose;
  newEmail: string | null;
}

/* Atomic consumption (see password-reset.ts); reason-indistinguishable
   null on any failure. */
export async function consumeEmailToken(token: string): Promise<ConsumedEmailToken | null> {
  if (!isEmailTokenFormat(token)) return null;
  const pool = getPool();
  const hash = hashEmailToken(token);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE email_verify_tokens SET used_at = UTC_TIMESTAMP()
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [hash],
  );
  if (res.affectedRows !== 1) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id, purpose, new_email FROM email_verify_tokens WHERE token_hash = ? LIMIT 1",
    [hash],
  );
  if (!rows[0]) return null;
  return {
    userId: Number(rows[0].user_id),
    purpose: rows[0].purpose as EmailTokenPurpose,
    newEmail: rows[0].new_email === null ? null : String(rows[0].new_email),
  };
}

/* The account tab's pending-change hint: the newest unused change
   token's target address, if any. */
export async function pendingEmailChange(userId: number): Promise<string | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT new_email FROM email_verify_tokens
     WHERE user_id = ? AND purpose = 'change' AND used_at IS NULL
       AND expires_at > UTC_TIMESTAMP()
     ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  return rows[0]?.new_email ? String(rows[0].new_email) : null;
}
