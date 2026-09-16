"use server";

/* Moderation write operations (shared by /admin and the detail-page
   toolbars): hide/unhide, management soft delete, hard delete,
   mute/unmute, profile reset, role management. Auth sits at the top of
   every action (requireModerator / requireAdmin — never trusting
   frontend hidden fields); all actions write through
   src/lib/moderation.ts and always leave a moderation_actions audit
   row. */
import { revalidatePath, updateTag } from "next/cache";
import { getLocale } from "@/src/lib/i18n-server";
import { t } from "@/src/lib/i18n";
import {
  PUBLIC_FEATURED_CACHE_TAG,
  PUBLIC_POSTS_CACHE_TAG,
  PUBLIC_USERS_CACHE_TAG,
  PUBLIC_WORKS_CACHE_TAG,
} from "@/src/lib/cache-tags";
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
  resolveFeedback,
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

/* Invalidate public-surface caches after moderation actions:
   lists/detail/home featured/admin console. */
function revalidateAfterContent(id: number, type: ModTargetType) {
  updateTag(HOME_CACHE_TAG);
  if (type === "post" || type === "work") {
    updateTag(PUBLIC_FEATURED_CACHE_TAG);
  }
  if (type === "post" || type === "comment") {
    updateTag(PUBLIC_POSTS_CACHE_TAG);
  }
  if (type === "work") updateTag(PUBLIC_WORKS_CACHE_TAG);
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

/* Management soft delete: posts/comments only (works have no soft
   state — their remedies are hide or hard delete). */
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

/* Hard delete: admin only; physical removal (a post's comments
   cascade), unrecoverable. */
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

/* ---- User moderation ---- */

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
  updateTag(PUBLIC_USERS_CACHE_TAG);
  revalidatePath("/admin");
  return { ok: true };
}

/* Role management: admin only; member <-> mod; admins can't be
   demoted (the target's current role is validated). */
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
  updateTag(PUBLIC_USERS_CACHE_TAG);
  revalidatePath("/admin");
  return { ok: true };
}

/* ---- List "load more" (read-only, no writes): returns a
   server-rendered page of rows matching the first page exactly (the
   render functions live in admin-lists). ---- */

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

/* Resolve an open member feedback flag (B2): the row leaves the
   console's open list; the target itself is acted on through the
   regular moderation tools before/after resolving. */
export async function resolveFeedbackAction(
  formData: FormData,
): Promise<void> {
  const user = await requireModerator();
  if (!user) return;
  const feedbackId = Number(formData.get("feedback_id"));
  if (!Number.isSafeInteger(feedbackId) || feedbackId <= 0) return;
  const ok = await resolveFeedback(user.id, feedbackId);
  if (ok) {
    revalidatePath("/admin");
  }
}
