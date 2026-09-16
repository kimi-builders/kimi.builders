"use server";

/* Settings write operations: profile (display name/handle/bio/avatar
   URL) and AI reply preferences. Everything passes the session first,
   then field validation; handle uniqueness excludes self at the query
   layer. */
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { isAllowedAvatarUrl } from "@/src/lib/avatar-urls";
import { issueEmailToken } from "@/src/lib/auth/email-verify";
import {
  isValidEmail,
  normalizeEmail,
} from "@/src/lib/auth/password";
import {
  hashPassword,
  passwordPolicyError,
  verifyPassword,
} from "@/src/lib/auth/password";
import {
  destroyAllSessions,
  destroyOtherSessions,
  getSessionUser,
  revokeSession,
} from "@/src/lib/auth/session";
import { renderEmailChangeMail, renderEmailVerifyMail } from "@/src/lib/email-templates";
import { sendMail } from "@/src/lib/mailer";
import { findEmailAccount } from "@/src/lib/auth/users";
import { getOwnProfile } from "@/src/lib/users";
import {
  deleteOwnAccount,
  getUserPasswordHash,
  setUserLocale,
  setUserPassword,
  unlinkProviderAccount,
} from "@/src/lib/auth/users";
import { PUBLIC_USERS_CACHE_TAG } from "@/src/lib/cache-tags";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { consumeUsageRateLimit } from "@/src/lib/usage/rate-limit";
import { normalizeVibe } from "@/src/lib/vibe";
import { updateAiPrefs, updateProfile, updateProfilePrivacy } from "@/src/lib/users";

const PREF_COOKIE = { path: "/", maxAge: 365 * 86400, sameSite: "lax" } as const;

/* Email links need the canonical origin (never the request host — see
   src/lib/auth/origin.ts); NEXT_PUBLIC_SITE_URL covers prod, local dev
   falls back to localhost. */
async function getSiteOrigin(): Promise<string> {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/* Explicit theme/language selection (the no-JS backstop for the
   settings seg and theme cards; the client already flipped optimally,
   this only persists the cookie; language also writes the account
   preference, same semantics as the community/actions toggles). */
export async function setThemeToAction(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set("kb_theme", formData.get("theme") === "light" ? "light" : "dark", PREF_COOKIE);
}

/* Explicit vibe selection (the vibe cards' no-JS backstop; invalid or
   missing falls back to the site default, DEFAULT_VIBE in
   src/lib/vibe.ts). */
export async function setVibeToAction(formData: FormData): Promise<void> {
  const store = await cookies();
  store.set("kb_vibe", normalizeVibe(String(formData.get("vibe") ?? "")), PREF_COOKIE);
}

/* Explicit motion preference (the reduce-motion seg's no-JS backstop):
   kb_motion=reduce -> site-wide motion degradation (the same rules as
   the system prefers-reduced-motion); anything else (incl. follow) =
   follow the system. */
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
  /* Reset-to-default avatar: the explicit clear flag outranks the URL
     field (clearing goes through updateProfile's clearAvatar). */
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

/* The two AI preference switches (optimistic client toggles; failures
   roll back and toast). */
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

/* The three profile-privacy switches (avatar/display name/bio; 1=
   public 0=self only), interacting like the AI preferences: optimistic
   client toggles, rollback on failure. */
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

/* Change password (the settings "account" tab): accounts with a
   password must verify the current one first (rate-limited like
   login); OAuth-signup accounts without one set it directly — the
   session is the credential. Sessions are stateless signed cookies, so
   a password change evicts no other device; forced sign-out needs a
   sessions table first (see session.ts). */
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
  /* A new password invalidates every other device's session (this
   device stays signed in — that's the device that just proved the old
   password). */
  await destroyOtherSessions(user.id);
  return { ok: true };
}

/* Unlink OAuth (the settings "account" tab): the last-login-method
   guard is re-checked inside the unlinkProviderAccount transaction;
   the failure codes here only translate. */
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

/* Self-service account deletion (B3): soft delete + anonymize. The
   typed-handle confirmation is enforced server-side too (a stray click
   or a crafted form must not delete an account). Every session row and
   the current cookie are removed after the account becomes inert. */
export async function deleteAccountAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { error: "auth" };
  const locale = await getLocale(user);
  const typed = String(formData.get("confirm_handle") ?? "").trim();
  if (typed !== user.handle) return { error: t(locale, "set.deleteMismatch") };
  const ok = await deleteOwnAccount(user.id);
  if (!ok) return { error: t(locale, "err.generic") };
  await destroyAllSessions(user.id);
  updateTag(PUBLIC_USERS_CACHE_TAG);
  return { ok: true };
}

/* ---- Email verification / change / sessions (B3 remaining) ---- */

/* Resend the verification mail (rate-limited by the token issuer's
   one-live-token rule: re-issuing invalidates the previous link). */
export async function resendVerifyEmailAction(): Promise<{
  ok?: boolean;
  error?: string;
}> {
  const user = await getSessionUser();
  if (!user) return { error: "auth" };
  const locale = await getLocale(user);
  const own = await getOwnProfile(user.id);
  if (!own?.email) return { error: t(locale, "set.noEmail") };
  if (own.emailVerified) return { ok: true };
  try {
    const token = await issueEmailToken(user.id, "verify");
    const origin = await getSiteOrigin();
    const mail = renderEmailVerifyMail({
      verifyUrl: `${origin}/api/auth/email/verify?token=${token}`,
      email: own.email,
      siteUrl: origin,
      locale,
    });
    const sent = await sendMail({ to: own.email, ...mail });
    if (!sent.ok) console.error(`resend verify mail user ${user.id}: ${sent.error}`);
  } catch (e) {
    console.error(`resend verify mail user ${user.id} failed:`, e);
  }
  /* Mail delivery itself is fail-soft: the answer is always ok — a
     failure detail would leak nothing but confusion. */
  return { ok: true };
}

/* Start an email change: password-gated (email accounts), validated
   against the usual rules, then a confirmation mail goes to the NEW
   address — the swap only happens when that mailbox answers. */
export async function changeEmailAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { error: "auth" };
  const locale = await getLocale(user);
  const newEmail = normalizeEmail(String(formData.get("email") ?? ""));
  if (!isValidEmail(newEmail)) return { error: t(locale, "login.errEmail") };
  const own = await getOwnProfile(user.id);
  if (!own) return { error: t(locale, "err.generic") };
  if (newEmail === own.email) return { error: t(locale, "set.emailSame") };
  if (await findEmailAccount(newEmail)) return { error: t(locale, "set.emailTaken") };
  /* Password proof for accounts that have one (OAuth-only accounts have
     none to prove — their provider identity already vouched). */
  const hash = await getUserPasswordHash(user.id);
  if (hash !== null) {
    const current = String(formData.get("current_password") ?? "");
    if (!(await verifyPassword(current, hash)))
      return { error: t(locale, "login.errCredentials") };
  }
  try {
    const token = await issueEmailToken(user.id, "change", newEmail);
    const origin = await getSiteOrigin();
    const mail = renderEmailChangeMail({
      confirmUrl: `${origin}/api/auth/email/verify?token=${token}`,
      newEmail,
      siteUrl: origin,
      locale,
    });
    const sent = await sendMail({ to: newEmail, ...mail });
    if (!sent.ok) {
      console.error(`change-email mail user ${user.id}: ${sent.error}`);
      return { error: t(locale, "set.mailFailed") };
    }
  } catch (e) {
    console.error(`change-email mail user ${user.id} failed:`, e);
    return { error: t(locale, "set.mailFailed") };
  }
  return { ok: true };
}

/* Revoke one other device from the account tab. */
export async function revokeSessionAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const sessionId = Number(formData.get("session_id"));
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return;
  await revokeSession(user.id, sessionId);
  revalidatePath("/settings");
}

/* "Log out everywhere": drops every session row including the current
   one; the client clears its own cookie and lands on the facade. */
export async function logoutEverywhereAction(): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  await destroyAllSessions(user.id);
  return { ok: true };
}
