/* 用户资料与账号的查询/变更(设置页、个人主页用)。
   登录态会话查询在 ./auth/session;注册落库在 ./auth/users。 */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { isAllowedAvatarUrl } from "./avatar-urls";
import { getPool } from "./db";

export interface UserProfile {
  id: number;
  handle: string;
  name: string;
  avatarUrl: string;
  bio: string;
  /* 资料字段级隐私(20260829_profile_privacy):1=公开(默认),0=仅自己;
     生效范围仅个人主页展示(见 profileDisplay),帖子/评论区发言标识不受影响 */
  showAvatar: boolean;
  showName: boolean;
  showBio: boolean;
  role: string;
  createdAt: Date;
}

export async function getProfileByHandle(
  handle: string,
): Promise<UserProfile | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, handle, name, avatar_url, bio,
            profile_show_avatar, profile_show_name, profile_show_bio, role, created_at
     FROM users WHERE handle = ? LIMIT 1`,
    [handle],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    showAvatar: !!r.profile_show_avatar,
    showName: !!r.profile_show_name,
    showBio: !!r.profile_show_bio,
    role: r.role,
    createdAt: r.created_at,
  };
}

/* 个人主页的展示口径(纯函数,本人视角不受限):
   头像隐藏 → 空串(调用方回落 handle 首字符);显示名隐藏 → 只显示 @handle;
   简介隐藏 → 空串(简介区不渲染)。 */
export interface ProfileDisplay {
  avatarUrl: string;
  displayName: string;
  bio: string;
}

export function profileDisplay(
  p: Pick<UserProfile, "handle" | "name" | "avatarUrl" | "bio" | "showAvatar" | "showName" | "showBio">,
  self: boolean,
): ProfileDisplay {
  if (self) {
    return {
      avatarUrl: p.avatarUrl,
      displayName: p.name || p.handle,
      bio: p.bio,
    };
  }
  return {
    avatarUrl: p.showAvatar ? p.avatarUrl : "",
    displayName: p.showName ? p.name || p.handle : `@${p.handle}`,
    bio: p.showBio ? p.bio : "",
  };
}

/* 设置页用的完整自有资料(SessionUser 不含 bio/email)。 */
export interface OwnProfile extends UserProfile {
  email: string | null;
  locale: string;
  aiRepliesEnabled: boolean;
  showAiReplies: boolean;
}

export async function getOwnProfile(userId: number): Promise<OwnProfile | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT id, handle, name, avatar_url, bio,
            profile_show_avatar, profile_show_name, profile_show_bio,
            role, created_at, email, locale, ai_replies_enabled, show_ai_replies
     FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    handle: r.handle,
    name: r.name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    showAvatar: !!r.profile_show_avatar,
    showName: !!r.profile_show_name,
    showBio: !!r.profile_show_bio,
    role: r.role,
    createdAt: r.created_at,
    email: r.email ?? null,
    locale: r.locale,
    aiRepliesEnabled: !!r.ai_replies_enabled,
    showAiReplies: !!r.show_ai_replies,
  };
}

export interface ProfileStats {
  posts: number;
  comments: number;
  likes: number;
}

/* 主页统计。self=false(访客视角)时帖子/评论只数公开且未被屏蔽的,不泄露私密/被屏蔽量。 */
export async function getProfileStats(
  userId: number,
  self: boolean,
): Promise<ProfileStats> {
  const postVis = self ? "" : "AND p.visibility = 'public' AND p.hidden_at IS NULL";
  const commentVis = self ? "" : "AND p.visibility = 'public' AND p.hidden_at IS NULL AND c.hidden_at IS NULL";
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM posts p WHERE p.user_id = ? AND p.deleted_at IS NULL ${postVis}) AS posts,
       (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id
         WHERE c.user_id = ? AND c.deleted_at IS NULL AND p.deleted_at IS NULL ${commentVis}) AS comments,
       (SELECT COUNT(*) FROM reactions r JOIN posts p ON p.id = r.target_id
         WHERE r.target_type = 'post' AND r.kind = 'up' AND p.user_id = ?
           AND p.deleted_at IS NULL ${postVis}) +
       (SELECT COUNT(*) FROM reactions r JOIN comments c ON c.id = r.target_id
         JOIN posts p ON p.id = c.post_id
         WHERE r.target_type = 'comment' AND r.kind = 'up' AND c.user_id = ?
           AND c.deleted_at IS NULL AND p.deleted_at IS NULL ${commentVis}) AS likes`,
    [userId, userId, userId, userId],
  );
  const r = rows[0] ?? { posts: 0, comments: 0, likes: 0 };
  return {
    posts: Number(r.posts),
    comments: Number(r.comments),
    likes: Number(r.likes),
  };
}

/* handle:小写字母/数字/下划线,1–28 位,至少含一个字母或数字。 */
export function validateHandle(h: string): boolean {
  return /^[a-z0-9_]{1,28}$/.test(h) && /[a-z0-9]/.test(h);
}

export type UpdateProfileResult = "ok" | "taken" | "invalid" | "avatar_invalid";

/* 资料更新:handle 变更要过格式 + 唯一性(排除自己);空 avatarUrl = 不修改;
   clearAvatar = 显式清空(恢复默认,下次 OAuth 登录重新同步 provider 头像)。 */
export async function updateProfile(
  userId: number,
  fields: { handle: string; name: string; bio: string; avatarUrl: string; clearAvatar?: boolean },
): Promise<UpdateProfileResult> {
  const handle = fields.handle.trim().toLowerCase();
  if (!validateHandle(handle)) return "invalid";
  if (!fields.clearAvatar && fields.avatarUrl.trim() && !isAllowedAvatarUrl(fields.avatarUrl))
    return "avatar_invalid";
  const [dup] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM users WHERE handle = ? AND id != ? LIMIT 1",
    [handle, userId],
  );
  if (dup[0]) return "taken";
  const sets = ["handle = ?", "name = ?", "bio = ?"];
  const args: (string | number)[] = [
    handle,
    fields.name.trim().slice(0, 64),
    fields.bio.trim().slice(0, 300),
  ];
  if (fields.clearAvatar) {
    sets.push("avatar_url = ''");
  } else if (fields.avatarUrl.trim()) {
    sets.push("avatar_url = ?");
    args.push(fields.avatarUrl.trim().slice(0, 500));
  }
  args.push(userId);
  const [res] = await getPool().query<ResultSetHeader>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    args,
  );
  return res.affectedRows > 0 ? "ok" : "invalid";
}

/* AI 回复偏好(v2 决策 3 的两个全局开关)。 */
export async function updateAiPrefs(
  userId: number,
  prefs: { aiRepliesEnabled: boolean; showAiReplies: boolean },
): Promise<void> {
  await getPool().query(
    "UPDATE users SET ai_replies_enabled = ?, show_ai_replies = ? WHERE id = ?",
    [prefs.aiRepliesEnabled ? 1 : 0, prefs.showAiReplies ? 1 : 0, userId],
  );
}

/* 资料展示隐私(20260829_profile_privacy):头像/显示名/简介三个独立开关,
   1=公开 0=仅自己;仅影响个人主页展示(见 profileDisplay)。 */
export async function updateProfilePrivacy(
  userId: number,
  prefs: { showAvatar: boolean; showName: boolean; showBio: boolean },
): Promise<void> {
  await getPool().query(
    "UPDATE users SET profile_show_avatar = ?, profile_show_name = ?, profile_show_bio = ? WHERE id = ?",
    [
      prefs.showAvatar ? 1 : 0,
      prefs.showName ? 1 : 0,
      prefs.showBio ? 1 : 0,
      userId,
    ],
  );
}

export interface LinkedAccount {
  provider: string;
  createdAt: Date;
}

export async function getLinkedAccounts(
  userId: number,
): Promise<LinkedAccount[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT provider, created_at FROM oauth_accounts WHERE user_id = ? ORDER BY id ASC",
    [userId],
  );
  return rows.map((r) => ({
    provider: r.provider,
    createdAt: r.created_at,
  }));
}
