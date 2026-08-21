"use server";

/* 设置页写操作:资料(显示名/handle/简介/头像 URL)与 AI 回复偏好。
   全部先过 session,再做字段校验;handle 唯一性在查询层排除自己。 */
import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { isAllowedAvatarUrl } from "@/src/lib/avatar-urls";
import {
  hashPassword,
  passwordPolicyError,
  verifyPassword,
} from "@/src/lib/auth/password";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  getUserPasswordHash,
  setUserLocale,
  setUserPassword,
  unlinkProviderAccount,
} from "@/src/lib/auth/users";
import { PUBLIC_USERS_CACHE_TAG } from "@/src/lib/cache-tags";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { consumeUsageRateLimit } from "@/src/lib/usage/rate-limit";
import { updateAiPrefs, updateProfile, updateProfilePrivacy } from "@/src/lib/users";

const PREF_COOKIE = { path: "/", maxAge: 365 * 86400, sameSite: "lax" } as const;

/* 主题/语言的显式选择(设置页 seg 与主题卡的无 JS 兜底;客户端已乐观翻转,
   这里只落 cookie;语言同步写账号偏好,与 community/actions 的翻转动作同语义)。 */
export async function setThemeToAction(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set("kb_theme", formData.get("theme") === "light" ? "light" : "dark", PREF_COOKIE);
}

/* 视觉气质显式选择(设置页气质卡的无 JS 兜底;默认 poster)。 */
export async function setVibeToAction(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set("kb_vibe", formData.get("vibe") === "soft" ? "soft" : "poster", PREF_COOKIE);
}

/* 动效偏好显式选择(设置页「减少动效」seg 的无 JS 兜底):
   kb_motion=reduce → 全站动效降级(与系统 prefers-reduced-motion 同一套规则);
   其余值(含 follow)= 跟随系统。 */
export async function setMotionToAction(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set(
    "kb_motion",
    formData.get("motion") === "reduce" ? "reduce" : "follow",
    PREF_COOKIE,
  );
}

export async function setLocaleToAction(formData: FormData): Promise<void> {
  const next = formData.get("locale") === "en" ? "en" : "zh";
  const store = await cookies();
  store.set("kb_locale", next, PREF_COOKIE);
  const user = await getSessionUser();
  if (user) await setUserLocale(user.id, next);
}

export interface SettingsState {
  ok?: boolean;
  error?: string;
}

export async function updateProfileAction(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };

  const handle = String(formData.get("handle") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const bio = String(formData.get("bio") || "").trim();
  const avatarUrl = String(formData.get("avatar_url") || "").trim();
  /* 恢复默认头像:显式清空标记优先于 URL 字段(清空走 updateProfile 的 clearAvatar) */
  const clearAvatar = formData.get("avatar_clear") === "1";

  if (name.length > 64) return { error: t(locale, "err.nameLong") };
  if (bio.length > 300) return { error: t(locale, "err.bioLong") };
  if (!clearAvatar && avatarUrl && !isAllowedAvatarUrl(avatarUrl))
    return { error: t(locale, "err.avatarHostInvalid") };

  const r = await updateProfile(user.id, { handle, name, bio, avatarUrl, clearAvatar });
  if (r === "taken") return { error: t(locale, "err.handleTaken") };
  if (r === "invalid") return { error: t(locale, "err.handleInvalid") };
  if (r === "avatar_invalid") return { error: t(locale, "err.avatarHostInvalid") };
  updateTag(PUBLIC_USERS_CACHE_TAG);
  return { ok: true };
}

/* AI 偏好两个开关(客户端乐观切换,失败回退并 toast)。 */
export async function updateAiPrefsAction(
  formData: FormData,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  await updateAiPrefs(user.id, {
    aiRepliesEnabled: formData.get("ai_mine") === "1",
    showAiReplies: formData.get("ai_show") === "1",
  });
  return { ok: true };
}

/* 资料展示隐私三个开关(头像/显示名/简介;1=公开 0=仅自己),
   交互同 AI 偏好:客户端乐观切换,失败回退。 */
export async function updateProfilePrivacyAction(
  formData: FormData,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  await updateProfilePrivacy(user.id, {
    showAvatar: formData.get("pd_avatar") === "1",
    showName: formData.get("pd_name") === "1",
    showBio: formData.get("pd_bio") === "1",
  });
  return { ok: true };
}

/* 改密码(设置页「账号」页签):已有密码需先验证当前密码(限速同登录口径);
   OAuth 注册的无密码账号直接设置,登录会话即凭证。会话是无状态签名 cookie,
   改密不踢其他设备——要强制下线得先换 sessions 表(session.ts 注释)。 */
export async function changePasswordAction(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  const allowed = await consumeUsageRateLimit({
    scope: "settings-change-password",
    identity: `u${user.id}`,
    limit: 5,
    windowSeconds: 600,
  });
  if (!allowed) return { error: t(locale, "err.rateLimited") };

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  const hash = await getUserPasswordHash(user.id);
  if (hash !== null && !(await verifyPassword(current, hash)))
    return { error: t(locale, "err.pwWrong") };
  const policy = passwordPolicyError(next);
  if (policy)
    return { error: t(locale, policy === "too_short" ? "login.errShort" : "login.errLong") };
  if (next !== confirm) return { error: t(locale, "login.errMismatch") };
  if (hash !== null && (await verifyPassword(next, hash)))
    return { error: t(locale, "err.pwSame") };
  await setUserPassword(user.id, await hashPassword(next));
  return { ok: true };
}

/* 解绑 OAuth(设置页「账号」页签):唯一登录方式守卫在 unlinkProviderAccount
   事务里重查,这里的失败码只负责翻译。 */
export async function unlinkProviderAction(
  _prev: SettingsState | null,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  const provider = String(formData.get("provider") ?? "");
  if (provider !== "github" && provider !== "google")
    return { error: t(locale, "err.generic") };
  const r = await unlinkProviderAccount(user.id, provider);
  if (r === "last_method") return { error: t(locale, "err.lastMethod") };
  if (r !== "ok") return { error: t(locale, "err.generic") };
  return { ok: true };
}
