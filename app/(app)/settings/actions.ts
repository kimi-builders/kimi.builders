"use server";

/* 设置页写操作:资料(显示名/handle/简介/头像 URL)与 AI 回复偏好。
   全部先过 session,再做字段校验;handle 唯一性在查询层排除自己。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { updateAiPrefs, updateProfile } from "@/src/lib/users";

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

  if (name.length > 64) return { error: t(locale, "err.nameLong") };
  if (bio.length > 300) return { error: t(locale, "err.bioLong") };
  if (avatarUrl && !/^https?:\/\/.+/.test(avatarUrl))
    return { error: t(locale, "err.avatarInvalid") };

  const r = await updateProfile(user.id, { handle, name, bio, avatarUrl });
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
