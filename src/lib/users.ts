/* Profile and account queries/mutations (settings page, profile page).
   Session lookups live in ./auth/session; signup upserts in
   ./auth/users. */
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { isAllowedAvatarUrl } from "./avatar-urls";
import { getPool } from "./db";

export interface UserProfile {
  id: number;
  handle: string;
  name: string;
  avatarUrl: string;
  bio: string;
  /* Per-field profile privacy: 1=public (default), 0=self only; it
     gates the profile page display alone (see profileDisplay) — post and
     comment attribution is unaffected. */
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

/* Profile display rules (pure; the owner's own view is unrestricted):
   hidden avatar -> empty string (callers fall back to the handle's
   first character); hidden display name -> @handle only; hidden bio ->
   empty string (the bio section never renders). */
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

/* Full own-profile for the settings page (SessionUser carries no
   bio/email). */
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

/* Profile stats. self=false (visitor view) counts only public,
   unhidden posts/comments — private/hidden counts never leak. */
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

/* Handle: lowercase letters/digits/underscores, 1-28 chars, at least
   one letter or digit. */
export function validateHandle(h: string): boolean {
  return /^[a-z0-9_]{1,28}$/.test(h) && /[a-z0-9]/.test(h);
}

export type UpdateProfileResult = "ok" | "taken" | "invalid" | "avatar_invalid";

/* Profile update: handle changes validate format + uniqueness
   (excluding self); an empty avatarUrl = no change; clearAvatar = an
   explicit reset to default (the next OAuth login re-syncs the provider
   avatar). */
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

/* AI reply preferences (the two global switches). */
export async function updateAiPrefs(
  userId: number,
  prefs: { aiRepliesEnabled: boolean; showAiReplies: boolean },
): Promise<void> {
  await getPool().query(
    "UPDATE users SET ai_replies_enabled = ?, show_ai_replies = ? WHERE id = ?",
    [prefs.aiRepliesEnabled ? 1 : 0, prefs.showAiReplies ? 1 : 0, userId],
  );
}

/* Profile display privacy: three independent switches (avatar/display
   name/bio), 1=public 0=self only; affects the profile page display
   alone (see profileDisplay). */
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
