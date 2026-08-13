/* 用户落库:oauth_accounts 命中 → 返回既有 user_id;
   未命中 → 建新 users 行(handle 去重)+ 绑定 oauth_accounts。
   不按邮箱自动并号(防撞号);同人多绑留到设置页再做。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { getPool } from "../db";
import {
  allowedProviderAvatar,
  isOwnAvatarUrl,
} from "../avatar-urls";
import type { OAuthProfile, Provider } from "./oauth";

export { isOwnAvatarUrl } from "../avatar-urls";

/* provider 头像是否允许同步到账号:当前头像为空,或不是站内自传的,才同步;
   用户自己上传过的头像不被后续 OAuth 登录冲掉。 */
export function shouldSyncProviderAvatar(
  current: string | null | undefined,
): boolean {
  const cur = (current ?? "").trim();
  return cur === "" || !isOwnAvatarUrl(cur);
}

/* 登录时的 provider 头像同步:带防覆盖条件(见上),无 provider 头像或无需变更时不动。 */
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
  /* 把已读旧值钉进 UPDATE，若用户在 SELECT 后刚上传自有头像，affectedRows=0，
     OAuth 登录不会覆盖并发的新值。 */
  const [res] = await pool.query<ResultSetHeader>(
    "UPDATE users SET avatar_url = ? WHERE id = ? AND avatar_url = ?",
    [next, userId, current],
  );
  return res.affectedRows > 0;
}

/* provider 账号 → 已绑定用户 id;未绑定返回 null。 */
export async function findLinkedUserId(
  provider: Provider,
  providerAccountId: string,
): Promise<number | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ? LIMIT 1",
    [provider, providerAccountId],
  );
  return rows[0] ? Number(rows[0].user_id) : null;
}

/* 登录后绑定(设置页发起):已绑给本人幂等 ok;已绑给别人 → taken(不抢绑);
   否则新建绑定行。 */
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
    /* 老用户登录:provider 头像同步带防覆盖条件(自传头像不冲掉;
       「恢复默认」清空 avatar_url 后,下次登录在这里重新同步 provider 头像) */
    await syncProviderAvatar(pool, linkedId, profile.avatarUrl);
    return linkedId;
  }

  /* 邮箱占用检查:已验证邮箱 → 自动并号(挂 provider 后登录既有账号,不再新建小号);
     未验证邮箱撞上既有账号 → 新号不落该邮箱(防唯一约束冲突 + 防撞号)。
     GitHub 只取 verified 邮箱、Google 要 email_verified=true(见 oauth.ts)。 */
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

/* 邮箱注册:不自动并号(防撞号);handle 从邮箱本地部分派生去重。 */
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

/* 设置页改密/展示用:返回当前密码哈希,无密码(OAuth 注册)为 null。
   哈希只留在服务端,不进任何客户端 props。 */
export async function getUserPasswordHash(userId: number): Promise<string | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const row = rows[0];
  return row?.password_hash == null ? null : String(row.password_hash);
}

/* 解绑守卫(纯函数):不能拿走账号最后一个登录方式——
   无密码且只剩这一条 OAuth 绑定时,解绑后账号将永远无法登录。 */
export function canUnlinkProvider(
  hasPassword: boolean,
  linkedCount: number,
): "ok" | "last_method" | "not_linked" {
  if (linkedCount <= 0) return "not_linked";
  if (!hasPassword && linkedCount === 1) return "last_method";
  return "ok";
}

/* 解绑 OAuth:事务里锁用户行重数登录方式(并发解绑两个 provider 也不会双双通过),
   守卫通过后删除绑定行;affectedRows=0 即本来就没绑。 */
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
    "SELECT id, password_hash FROM users WHERE email = ? LIMIT 1",
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
