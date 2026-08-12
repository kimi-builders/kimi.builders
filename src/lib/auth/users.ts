/* 用户落库:oauth_accounts 命中 → 返回既有 user_id;
   未命中 → 建新 users 行(handle 去重)+ 绑定 oauth_accounts。
   不按邮箱自动并号(防撞号);同人多绑留到设置页再做。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import { getPool } from "../db";
import type { OAuthProfile, Provider } from "./oauth";

/* ---- 头像同步约定(防 OAuth 覆盖)----
   用户在站内上传的头像落在自家 CDN:key 形如 avatar/yyyyMM/<hash>.webp,
   公开 URL 以 R2_PUBLIC_BASE_URL(默认 https://cdn.kimi.builders)为 host。
   判定「自有头像」:URL host 与 R2_PUBLIC_BASE_URL 相同,或路径以 /avatar/ 开头
   (双条件任一即可,兼容换 CDN 域名前的存量数据)。 */
export function isOwnAvatarUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  const base = (
    process.env.R2_PUBLIC_BASE_URL || "https://cdn.kimi.builders"
  ).replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(base).host;
  } catch {
    /* R2_PUBLIC_BASE_URL 配置异常时退化为只看 /avatar/ 前缀 */
  }
  try {
    const parsed = new URL(u);
    if (host && parsed.host === host) return true;
    return parsed.pathname.startsWith("/avatar/");
  } catch {
    /* 非绝对 URL(存量 key 路径等):只看 /avatar/ 前缀 */
    return u.startsWith("/avatar/");
  }
}

/* provider 头像是否允许同步到账号:当前头像为空,或不是站内自传的,才同步;
   用户自己上传过的头像不被后续 OAuth 登录冲掉。 */
export function shouldSyncProviderAvatar(
  current: string | null | undefined,
): boolean {
  const cur = (current ?? "").trim();
  return cur === "" || !isOwnAvatarUrl(cur);
}

/* 登录时的 provider 头像同步:带防覆盖条件(见上),无 provider 头像或无需变更时不动。 */
async function syncProviderAvatar(
  pool: Pool,
  userId: number,
  providerAvatarUrl: string,
): Promise<void> {
  const next = providerAvatarUrl.trim().slice(0, 500);
  if (!next) return;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT avatar_url FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const current = rows[0] ? String(rows[0].avatar_url ?? "") : "";
  if (current === next || !shouldSyncProviderAvatar(current)) return;
  await pool.query("UPDATE users SET avatar_url = ? WHERE id = ?", [next, userId]);
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
    [handle, profile.name.slice(0, 64), emailTaken ? null : profile.email, profile.avatarUrl.slice(0, 500)],
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
