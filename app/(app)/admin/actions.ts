"use server";

/* 治理写操作(/admin 与详情页管理工具条共用):屏蔽/解除、管理软删、硬删除、
   禁言/解禁、资料重置、角色管理。
   鉴权在每个 action 顶部(requireModerator / requireAdmin,不信任前端隐藏);
   所有动作经 src/lib/moderation.ts 落库,必写 moderation_actions 审计。 */
import { revalidatePath, updateTag } from "next/cache";
import { getLocale } from "@/src/lib/i18n-server";
import { t } from "@/src/lib/i18n";
import { HOME_CACHE_TAG } from "@/src/lib/home";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/src/lib/db";
import {
  adminDeleteComment,
  adminDeletePost,
  canChangeRole,
  hardDeleteComment,
  hardDeletePost,
  hardDeleteWork,
  hideContent,
  muteUntilFor,
  muteUser,
  requireAdmin,
  requireModerator,
  resetUserProfile,
  setUserRole,
  unhideContent,
  unmuteUser,
  type ModTargetType,
} from "@/src/lib/moderation";

export interface ModResult {
  ok: boolean;
  error?: string;
}

function targetTypeOf(raw: string): ModTargetType | null {
  return raw === "post" || raw === "comment" || raw === "work" ? raw : null;
}

/* 治理动作后作废公共面缓存:列表/详情/首页精选/管理台。 */
function revalidateAfterContent(id: number, type: ModTargetType) {
  updateTag(HOME_CACHE_TAG);
  revalidatePath("/community");
  revalidatePath("/works");
  revalidatePath("/awesome");
  revalidatePath("/admin");
  revalidatePath("/");
  if (type === "post") revalidatePath(`/community/${id}`);
  if (type === "work") revalidatePath(`/works/${id}`);
}

export async function hideContentAction(formData: FormData): Promise<ModResult> {
  const user = await requireModerator();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const type = targetTypeOf(String(formData.get("target_type") || ""));
  const id = Number(formData.get("target_id"));
  const reason = String(formData.get("reason") || "").trim();
  if (!type || !Number.isSafeInteger(id) || id <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  const ok = await hideContent(user.id, type, id, reason);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidateAfterContent(id, type);
  return { ok: true };
}

export async function unhideContentAction(formData: FormData): Promise<ModResult> {
  const user = await requireModerator();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const type = targetTypeOf(String(formData.get("target_type") || ""));
  const id = Number(formData.get("target_id"));
  if (!type || !Number.isSafeInteger(id) || id <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  const ok = await unhideContent(user.id, type, id);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidateAfterContent(id, type);
  return { ok: true };
}

/* 管理软删:仅帖子/评论(works 无软删态,处置 = 屏蔽或硬删)。 */
export async function adminDeleteAction(formData: FormData): Promise<ModResult> {
  const user = await requireModerator();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const type = targetTypeOf(String(formData.get("target_type") || ""));
  const id = Number(formData.get("target_id"));
  const reason = String(formData.get("reason") || "").trim();
  if (!type || type === "work" || !Number.isSafeInteger(id) || id <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  const ok =
    type === "post"
      ? await adminDeletePost(user.id, id, reason)
      : await adminDeleteComment(user.id, id, reason);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidateAfterContent(id, type);
  return { ok: true };
}

/* 硬删除:仅 admin;物理删除(帖子的评论级联),不可恢复。 */
export async function hardDeleteAction(formData: FormData): Promise<ModResult> {
  const user = await requireAdmin();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const type = targetTypeOf(String(formData.get("target_type") || ""));
  const id = Number(formData.get("target_id"));
  const reason = String(formData.get("reason") || "").trim();
  if (!type || !Number.isSafeInteger(id) || id <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  const ok =
    type === "post"
      ? await hardDeletePost(user.id, id, reason)
      : type === "comment"
        ? await hardDeleteComment(user.id, id, reason)
        : await hardDeleteWork(user.id, id, reason);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidateAfterContent(id, type);
  return { ok: true };
}

/* ---- 用户治理 ---- */

export async function muteUserAction(formData: FormData): Promise<ModResult> {
  const user = await requireModerator();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const targetId = Number(formData.get("user_id"));
  const raw = String(formData.get("duration") || "");
  const until = muteUntilFor(raw === "forever" ? "forever" : Number(raw));
  const reason = String(formData.get("reason") || "").trim();
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || until === null)
    return { ok: false, error: t(locale, "err.generic") };
  const ok = await muteUser(user.id, targetId, until, reason);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidatePath("/admin");
  return { ok: true };
}

export async function unmuteUserAction(formData: FormData): Promise<ModResult> {
  const user = await requireModerator();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const targetId = Number(formData.get("user_id"));
  if (!Number.isSafeInteger(targetId) || targetId <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  const ok = await unmuteUser(user.id, targetId);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidatePath("/admin");
  return { ok: true };
}

export async function resetProfileAction(formData: FormData): Promise<ModResult> {
  const user = await requireModerator();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const targetId = Number(formData.get("user_id"));
  const reason = String(formData.get("reason") || "").trim();
  if (!Number.isSafeInteger(targetId) || targetId <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  const ok = await resetUserProfile(user.id, targetId, reason);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidatePath("/admin");
  return { ok: true };
}

/* 角色管理:仅 admin;member ⇄ mod;admin 不可被降(校验目标当前角色)。 */
export async function setRoleAction(formData: FormData): Promise<ModResult> {
  const user = await requireAdmin();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.forbidden") };
  const targetId = Number(formData.get("user_id"));
  const nextRole = String(formData.get("role") || "");
  if (!Number.isSafeInteger(targetId) || targetId <= 0)
    return { ok: false, error: t(locale, "err.generic") };
  if (nextRole !== "member" && nextRole !== "mod")
    return { ok: false, error: t(locale, "err.generic") };
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT role FROM users WHERE id = ? LIMIT 1",
    [targetId],
  );
  if (!rows[0]) return { ok: false, error: t(locale, "err.generic") };
  if (
    !canChangeRole({
      actorRole: user.role,
      actorId: user.id,
      targetRole: rows[0].role,
      targetId,
      nextRole,
    })
  )
    return { ok: false, error: t(locale, "err.forbidden") };
  const ok = await setUserRole(user.id, targetId, nextRole);
  if (!ok) return { ok: false, error: t(locale, "err.generic") };
  revalidatePath("/admin");
  return { ok: true };
}

/* ---- 列表「加载更多」(只读,不落库):返回服务端渲染好的一页行,
   与首屏同口径(渲染函数在 admin-lists)。---- */

import type { ReactNode } from "react";
import {
  getModerationContent,
  getModerationLog,
  isAdmin,
  type ModContentState,
} from "@/src/lib/moderation";
import { renderContentRows, renderLogRows } from "./_components/admin-lists";

export interface AdminListPage {
  nodes: ReactNode[];
  nextCursor: number | null;
}

export async function loadMoreAdminContentAction(
  scope: { type: ModTargetType; state: ModContentState },
  after: number,
): Promise<({ ok: true } & AdminListPage) | { ok: false }> {
  const user = await requireModerator();
  if (!user || !Number.isSafeInteger(after) || after <= 0) return { ok: false };
  const locale = await getLocale(user);
  const data = await getModerationContent({
    type: scope.type,
    state: scope.state,
    after,
  });
  return {
    ok: true,
    nodes: renderContentRows(data.rows, locale, isAdmin(user.role)),
    nextCursor: data.nextCursor,
  };
}

export async function loadMoreAdminLogAction(
  after: number,
): Promise<({ ok: true } & AdminListPage) | { ok: false }> {
  const user = await requireModerator();
  if (!user || !Number.isSafeInteger(after) || after <= 0) return { ok: false };
  const locale = await getLocale(user);
  const data = await getModerationLog(after);
  return {
    ok: true,
    nodes: renderLogRows(data.rows, locale),
    nextCursor: data.nextCursor,
  };
}
