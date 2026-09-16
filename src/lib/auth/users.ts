/* User upsert: an oauth_accounts hit returns the existing user_id; a miss
   creates a new users row (handle deduped) and binds the oauth_accounts
   row. No automatic account merging by email (anti-hijack); linking
   multiple providers to one person happens later in settings. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { getPool } from "../db";
import {
  allowedProviderAvatar,
  isOwnAvatarUrl,
} from "../avatar-urls";
import type { OAuthProfile, Provider } from "./oauth";

export { isOwnAvatarUrl } from "../avatar-urls";

/* Whether a provider avatar may sync into the account: only when the
   current avatar is empty or was not uploaded on site — a user-uploaded
   avatar is never overwritten by later OAuth logins. */
export function shouldSyncProviderAvatar(
  current: string | null | undefined,
): boolean {
  const cur = (current ?? "").trim();
  return cur === "" || !isOwnAvatarUrl(cur);
}

/* Login-time provider avatar sync: guarded against overwrite (see
   above); no provider avatar or no change means no write. */
export async function syncProviderAvatar(
  pool: Pool,
  userId: number,
  providerAvatarUrl: string,
): Promise<boolean> {
  const next = allowedProviderAvatar(providerAvatarUrl);
  if (!next) return false;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT avatar_url FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const current = rows[0] ? String(rows[0].avatar_url ?? "") : "";
  if (current === next || !shouldSyncProviderAvatar(current)) return false;
  /* Pin the previously read value into the UPDATE: if the user uploaded
     their own avatar right after the SELECT, affectedRows=0 and the OAuth
     login does not clobber the concurrent new value. */
  const [res] = await pool.query<ResultSetHeader>(
    "UPDATE users SET avatar_url = ? WHERE id = ? AND avatar_url = ?",
    [next, userId, current],
  );
  return res.affectedRows > 0;
}

/* Provider account -> bound user id; null when unbound. Deleted
   accounts never resolve (soft-deleted users cannot log back in). */
export async function findLinkedUserId(
  provider: Provider,
  providerAccountId: string,
): Promise<number | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT o.user_id FROM oauth_accounts o
     JOIN users u ON u.id = o.user_id
     WHERE o.provider = ? AND o.provider_account_id = ?
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [provider, providerAccountId],
  );
  return rows[0] ? Number(rows[0].user_id) : null;
}

/* Self-service account deletion (B3): soft delete + anonymize in one
   statement. The handle becomes deleted-<id> (releases the visible
   handle while staying unique), email/password are cleared (frees the
   address for re-registration; password login dies with the hash), and
   the content stays for FK integrity. Login paths all filter
   deleted_at (session / email / OAuth), so the stale signed cookie
   becomes inert on the next request. */
export async function deleteOwnAccount(userId: number): Promise<boolean> {
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE users SET
       deleted_at = NOW(),
       handle = CONCAT('deleted-', id),
       name = '',
       bio = '',
       avatar_url = '',
       email = NULL,
       password_hash = NULL
     WHERE id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return res.affectedRows > 0;
}

/* Post-login linking (initiated from settings): idempotent ok when
   already bound to the same user; "taken" when bound to someone else
   (never stolen); otherwise a new binding row. */
export async function linkProviderAccount(
  userId: number,
  provider: Provider,
  profile: OAuthProfile,
): Promise<"ok" | "taken"> {
  const existing = await findLinkedUserId(provider, profile.providerAccountId);
  if (existing === userId) return "ok";
  if (existing !== null) return "taken";
  await getPool().query(
    "INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES (?, ?, ?)",
    [userId, provider, profile.providerAccountId],
  );
  return "ok";
}

export async function findOrCreateUser(
  provider: Provider,
  profile: OAuthProfile,
): Promise<number> {
  const pool = getPool();
  const linkedId = await findLinkedUserId(provider, profile.providerAccountId);
  if (linkedId !== null) {
    /* Returning user login: provider avatar sync with overwrite guard
       (uploaded avatars survive; after "reset to default" clears
       avatar_url, the next login re-syncs the provider avatar here). */
    await syncProviderAvatar(pool, linkedId, profile.avatarUrl);
    return linkedId;
  }

  /* Email occupancy check: a verified email merges accounts automatically
     (logging in with the provider attaches to the existing account
     instead of creating a duplicate); an unverified email colliding with
     an existing account is simply not stored on the new one (avoids the
     unique constraint and account preemption). GitHub yields only
     verified emails and Google requires email_verified=true (see
     oauth.ts). */
  let emailTaken = false;
  if (profile.email) {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [profile.email],
    );
    if (rows[0]) {
      if (profile.emailVerified) {
        const uid = Number(rows[0].id);
        await pool.query(
          "INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES (?, ?, ?)",
          [uid, provider, profile.providerAccountId],
        );
        await syncProviderAvatar(pool, uid, profile.avatarUrl);
        return uid;
      }
      emailTaken = true;
    }
  }

  const handle = await uniqueHandle(pool, profile.handle || profile.name || "builder");
  const [res] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (handle, name, email, avatar_url) VALUES (?, ?, ?, ?)",
    [
      handle,
      profile.name.slice(0, 64),
      emailTaken ? null : profile.email,
      allowedProviderAvatar(profile.avatarUrl),
    ],
  );
  const uid = Number(res.insertId);
  await pool.query(
    "INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES (?, ?, ?)",
    [uid, provider, profile.providerAccountId],
  );
  return uid;
}

/* Email signup: no automatic merging (anti-hijack); the handle derives
   from the email local-part with dedup. */
export async function createEmailUser(email: string, name?: string): Promise<number> {
  const pool = getPool();
  const localPart = email.split("@")[0] || "builder";
  const handle = await uniqueHandle(pool, name || localPart);
  const display = (name || localPart).slice(0, 64);
  const [res] = await pool.query<ResultSetHeader>(
    "INSERT INTO users (handle, name, email) VALUES (?, ?, ?)",
    [handle, display, email],
  );
  return Number(res.insertId);
}

export async function setUserPassword(userId: number, passwordHash: string): Promise<void> {
  await getPool().query("UPDATE users SET password_hash = ? WHERE id = ?", [
    passwordHash,
    userId,
  ]);
}

/* For settings-page password change and display: returns the current
   password hash, null when the account has no password (OAuth signup).
   Hashes stay server-side, never in client props. */
export async function getUserPasswordHash(userId: number): Promise<string | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const row = rows[0];
  return row?.password_hash == null ? null : String(row.password_hash);
}

/* Unlink guard (pure): the last login method cannot be removed — with no
   password and only one OAuth binding left, unlinking would lock the
   account out forever. */
export function canUnlinkProvider(
  hasPassword: boolean,
  linkedCount: number,
): "ok" | "last_method" | "not_linked" {
  if (linkedCount <= 0) return "not_linked";
  if (!hasPassword && linkedCount === 1) return "last_method";
  return "ok";
}

/* Unlink OAuth: locks the user row and recounts login methods inside a
   transaction (two concurrent unlinks cannot both pass the guard), then
   deletes the binding; affectedRows=0 means it was never bound. */
export async function unlinkProviderAccount(
  userId: number,
  provider: Provider,
): Promise<"ok" | "last_method" | "not_linked"> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [urows] = await connection.query<RowDataPacket[]>(
      "SELECT password_hash FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
      [userId],
    );
    const hasPassword = urows[0]?.password_hash != null;
    const [crows] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM oauth_accounts WHERE user_id = ?",
      [userId],
    );
    const guard = canUnlinkProvider(hasPassword, Number(crows[0]?.n ?? 0));
    if (guard !== "ok") {
      await connection.rollback();
      return guard;
    }
    const [res] = await connection.query<ResultSetHeader>(
      "DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?",
      [userId, provider],
    );
    await connection.commit();
    return res.affectedRows > 0 ? "ok" : "not_linked";
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

export interface EmailAccountRow {
  id: number;
  passwordHash: string | null;
}

export async function findEmailAccount(email: string): Promise<EmailAccountRow | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, password_hash FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1",
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    passwordHash: row.password_hash === null ? null : String(row.password_hash),
  };
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
