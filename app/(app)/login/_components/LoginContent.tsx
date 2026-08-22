/* Login/signup body: shared by the full page (/login) and the modal
   (@modal/(.)login). showTitle=false collapses the h1 (the modal has
   its own title bar, retitled per mode — see loginModeOf). Three
   entries: GitHub / Google / email; the email part is a native form
   that works without JS (the 303 redirect carries error/next).
   Signed-in visits redirect straight to next — effective inside
   intercepted routes too. Layout: explanatory copy appears per mode —
   the OAuth area/divider/login-signup tabs render only for
   login/register (forgot/reset are pure email flows, no unrelated
   elements); the reset-rules fine print sits only under the
   forgot-password form, keeping login/signup bottoms clean; the tabs
   use the site's standard segmented control (same as sort/view
   toggles). */
import Link from "next/link";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { t, type I18nKey } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { redirect } from "next/navigation";
import OAuthButtons from "@/components/OAuthButtons";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

const ERROR_KEYS: Record<string, I18nKey> = {
  invalid_origin: "login.errOrigin",
  rate_limited: "login.errRate",
  invalid_email: "login.errEmail",
  too_short: "login.errShort",
  too_long: "login.errLong",
  password_mismatch: "login.errMismatch",
  email_taken: "login.errTaken",
  bad_credentials: "login.errCredentials",
  invalid_token: "login.errToken",
};

export type LoginMode = "login" | "register" | "forgot" | "reset";

/* URL mode convergence (the modal title and body share one parse, so
   the two never drift). */
export function loginModeOf(sp: Record<string, string | string[] | undefined>): LoginMode {
  const raw = Array.isArray(sp.mode) ? sp.mode[0] : sp.mode;
  return raw === "register" || raw === "forgot" || raw === "reset" ? raw : "login";
}

/* Mode -> title key (shared by the modal title bar and the full-page
   h1). */
export function loginTitleKey(mode: LoginMode): I18nKey {
  return mode === "register"
    ? "login.titleRegister"
    : mode === "forgot"
      ? "login.titleForgot"
      : mode === "reset"
        ? "login.titleReset"
        : "login.title";
}

export default async function LoginContent({
  searchParams,
  showTitle = true,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  showTitle?: boolean;
}) {
  const user = await getSessionUser();
  const sp = await searchParams;
  const next = safeReturnTo(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  if (user) redirect(next === "/" ? "/community" : next);

  const locale = await getLocale(null);
  const mode = loginModeOf(sp);
  const errorCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const errorKey = errorCode ? ERROR_KEYS[errorCode] : undefined;
  const token = (Array.isArray(sp.token) ? sp.token[0] : sp.token) ?? "";
  const sent = (Array.isArray(sp.sent) ? sp.sent[0] : sp.sent) === "1";
  /* OAuth and the tabs belong to login/signup only (forgot/reset are
     pure email flows). */
  const emailOnly = mode === "forgot" || mode === "reset";
  /* next pass-through: carried across forgot/reset/back-to-login —
     otherwise the redirect target is lost once the user logs in from
     those pages. */
  const nextQuery = next === "/" ? "" : `&next=${encodeURIComponent(next)}`;

  const inputCls =
    "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper outline-none focus:border-blue focus:ring-4 focus:ring-blue/10";
  const submitCls =
 "w-full rounded-lg bg-blue px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90";

  return (
    <div className={`mx-auto max-w-sm ${showTitle ? "rounded-2xl border border-line bg-card p-5 sm:p-6" : ""}`}>
      {showTitle && (
        <h1 className="text-2xl font-semibold text-paper">
          {t(locale, loginTitleKey(mode))}
        </h1>
      )}
      {/* One helper sentence per mode: sign-in and sign-up each speak for
          themselves; forgot/reset carry their own copy inside their forms,
          not one global long sentence. */}
      {!emailOnly && (
        <p className={`text-xs leading-relaxed text-grey ${showTitle ? "mt-2" : ""}`}>
          {t(locale, mode === "register" ? "login.registerSubtitle" : "login.subtitle")}
        </p>
      )}

      {/* OAuth entries: shared component (same source as the gated-page prompt cards) */}
      {!emailOnly && (
        <div className="mt-6 space-y-2">
          <OAuthButtons next={next} block />
        </div>
      )}

      {!emailOnly && (
        <div className="my-5 flex items-center gap-3 font-mono text-xs text-grey">
          <span className="h-px flex-1 bg-line" />
          {t(locale, "login.emailDivider")}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      {/* Mode switches all use Link soft navigation: a native <a> hard-
          navigates and bypasses the intercepted route — clicking a tab
          inside the modal would swap in a full page (width/shape jump).
          Link only changes searchParams, the modal stays mounted, and the
          content switches in place. */}
      {!emailOnly && (
        <div className="flex justify-center">
          <nav aria-label={t(locale, "login.title")} className={SEG_WRAP}>
            {(["login", "register"] as const).map((m) => (
              <Link
                key={m}
                href={`/login?mode=${m}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`}
                aria-current={m === mode ? "page" : undefined}
                className={`${SEG_ITEM} ${m === mode ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                {t(locale, m === "login" ? "login.signIn" : "login.register")}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {errorKey && (
        <p className="mt-4 rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">
          {t(locale, errorKey)}
        </p>
      )}

      {mode === "login" && (
        /* next rides the action URL query: routes validate/rate-limit
           before parsing forms (safe ordering) and read the redirect
           target from the query only. */
        <form method="POST" action={`/api/auth/email/login${nextQuery ? `?next=${encodeURIComponent(next)}` : ""}`} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block font-mono text-xs text-grey" htmlFor="email">
              {t(locale, "auth.email")}
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="block font-mono text-xs text-grey" htmlFor="password">
                {t(locale, "login.password")}
              </label>
              <Link
                href={`/login?mode=forgot${nextQuery}`}
                className="font-mono text-xs text-grey transition-colors hover:text-paper"
              >
                {t(locale, "login.forgot")}
              </Link>
            </div>
            <input id="password" name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </div>
          <button type="submit" className={submitCls}>
            <Mail size={12} className="mr-1 inline" /> {t(locale, "login.signIn")}
          </button>
        </form>
      )}

      {mode === "register" && (
        <form method="POST" action={`/api/auth/email/register${nextQuery ? `?next=${encodeURIComponent(next)}` : ""}`} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block font-mono text-xs text-grey" htmlFor="reg-email">
              {t(locale, "auth.email")}
            </label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-xs text-grey" htmlFor="reg-name">
              {t(locale, "login.displayName")}
            </label>
            <input id="reg-name" name="name" type="text" maxLength={64} autoComplete="nickname" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-xs text-grey" htmlFor="reg-password">
              {t(locale, "login.password8")}
            </label>
            <input id="reg-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-xs text-grey" htmlFor="reg-password2">
              {t(locale, "login.confirmPassword")}
            </label>
            <input id="reg-password2" name="password2" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <button type="submit" className={submitCls}>
            <Mail size={12} className="mr-1 inline" /> {t(locale, "login.registerSubmit")}
          </button>
        </form>
      )}

      {mode === "forgot" &&
        (sent ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-blue/40 bg-blue/10 px-3 py-2 text-xs leading-relaxed text-paper">
              {t(locale, "login.forgotSent")}
            </p>
            <Link
              href={`/login?mode=forgot${nextQuery}`}
              className="inline-block font-mono text-xs text-grey transition-colors hover:text-paper"
            >
              <span className="inline-flex items-center gap-1.5">
                {t(locale, "login.resend")}
                <ArrowRight size={12} aria-hidden="true" />
              </span>
            </Link>
          </div>
        ) : (
          <form method="POST" action={`/api/auth/email/forgot${nextQuery ? `?next=${encodeURIComponent(next)}` : ""}`} className="mt-4 space-y-3">
            <p className="text-xs leading-relaxed text-grey">
              {t(locale, "login.forgotIntro")}
            </p>
            <div>
              <label className="mb-1 block font-mono text-xs text-grey" htmlFor="forgot-email">
                {t(locale, "auth.email")}
              </label>
              <input id="forgot-email" name="email" type="email" required autoComplete="email" className={inputCls} />
            </div>
            <button type="submit" className={submitCls}>
              <Mail size={12} className="mr-1 inline" /> {t(locale, "login.sendReset")}
            </button>
            {/* Password reset rules (housed here; the old global footer had nothing to do with sign-in/up) */}
            <p className="font-mono text-xs leading-relaxed text-grey/80">
              · {t(locale, "login.resetRule")}
              <br />· {t(locale, "login.resetContact")}
            </p>
          </form>
        ))}

      {mode === "reset" &&
        (token ? (
          <form method="POST" action={`/api/auth/email/reset${nextQuery ? `?next=${encodeURIComponent(next)}` : ""}`} className="mt-4 space-y-3">
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="mb-1 block font-mono text-xs text-grey" htmlFor="reset-password">
                {t(locale, "login.newPassword8")}
              </label>
              <input id="reset-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block font-mono text-xs text-grey" htmlFor="reset-password2">
                {t(locale, "login.confirmNewPassword")}
              </label>
              <input id="reset-password2" name="password2" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
            </div>
            <button type="submit" className={submitCls}>
              <Mail size={12} className="mr-1 inline" /> {t(locale, "login.resetSubmit")}
            </button>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">
              {t(locale, "login.errToken")}
            </p>
            <Link
              href={`/login?mode=forgot${nextQuery}`}
              className="inline-block font-mono text-xs text-grey transition-colors hover:text-paper"
            >
              <span className="inline-flex items-center gap-1.5">
                {t(locale, "login.requestNew")}
                <ArrowRight size={12} aria-hidden="true" />
              </span>
            </Link>
          </div>
        ))}

      {(mode === "forgot" || mode === "reset") && (
        <p className="mt-4 font-mono text-xs">
          <Link href={`/login${nextQuery ? `?next=${encodeURIComponent(next)}` : ""}`} className="inline-flex items-center gap-1.5 text-grey transition-colors hover:text-paper">
            <ArrowLeft size={12} aria-hidden="true" />
            {t(locale, "login.backSignIn")}
          </Link>
        </p>
      )}
    </div>
  );
}
