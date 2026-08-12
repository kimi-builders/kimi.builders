"use server";

/* 设置页写操作:资料(显示名/handle/简介/头像 URL)与 AI 回复偏好。
   全部先过 session,再做字段校验;handle 唯一性在查询层排除自己。 */
import { cookies } from "next/headers";
import { getSessionUser } from "@/src/lib/auth/session";
import { setUserLocale } from "@/src/lib/auth/users";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { updateAiPrefs, updateProfile, updateProfilePrivacy } from "@/src/lib/users";

const PREF_COOKIE = { path: "/", maxAge: 365 * 86400, sameSite: "lax" } as const;

/* 主题/语言的显式选择(设置页 seg 与主题卡的无 JS 兜底;客户端已乐观翻转,
   这里只落 cookie;语言同步写账号偏好,与 community/actions 的翻转动作同语义)。 */
export async function setThemeToAction(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set("kb_theme", formData.get("theme") === "light" ? "light" : "dark", PREF_COOKIE);
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
  if (!clearAvatar && avatarUrl && !/^https?:\/\/.+/.test(avatarUrl))
    return { error: t(locale, "err.avatarInvalid") };

  const r = await updateProfile(user.id, { handle, name, bio, avatarUrl, clearAvatar });
  if (r === "taken") return { error: t(locale, "err.handleTaken") };
  if (r === "invalid") return { error: t(locale, "err.handleInvalid") };
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
