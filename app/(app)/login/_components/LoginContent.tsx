/* 登录/注册主体:完整页(/login)与弹窗(@modal/(.)login)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏)。
   GitHub / Google / 邮箱三入口;邮箱部分是无 JS 也能用的原生表单(303 回跳
   携带 error/next)。已登录访问直接 redirect(next)——在拦截路由里同样生效。 */
import GoogleColor from "@lobehub/icons/es/Google/components/Color";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { t, type I18nKey } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { redirect } from "next/navigation";
import GithubIcon from "../../_components/GithubIcon";

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
  const rawMode = Array.isArray(sp.mode) ? sp.mode[0] : sp.mode;
  const mode =
    rawMode === "register" || rawMode === "forgot" || rawMode === "reset"
      ? rawMode
      : "login";
  const errorCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const errorKey = errorCode ? ERROR_KEYS[errorCode] : undefined;
  const token = (Array.isArray(sp.token) ? sp.token[0] : sp.token) ?? "";
  const sent = (Array.isArray(sp.sent) ? sp.sent[0] : sp.sent) === "1";

  const inputCls =
    "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper outline-none focus:border-blue focus:ring-4 focus:ring-blue/10";
  const submitCls =
    "w-full rounded-lg bg-blue px-4 py-2.5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/15 hover:opacity-90";
  const oauthNext = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <div className={`mx-auto max-w-sm ${showTitle ? "rounded-2xl border border-line bg-card p-5 sm:p-6" : ""}`}>
      {showTitle && (
        <h1 className="font-mono text-lg font-semibold text-paper">
          {t(locale, "login.title")}
        </h1>
      )}
      <p className="mt-2 text-xs leading-relaxed text-grey">
        {t(locale, "login.subtitle")}
      </p>

      <div className="mt-6 space-y-2">
        <a
          href={`/api/auth/github${oauthNext}`}
          className="flex items-center justify-center gap-2 rounded-lg border border-line bg-bg/40 px-4 py-2.5 font-mono text-xs text-paper transition-colors hover:border-blue"
        >
          <GithubIcon size={15} />
          GitHub
        </a>
        <a
          href={`/api/auth/google${oauthNext}`}
          className="flex items-center justify-center gap-2 rounded-lg border border-line bg-bg/40 px-4 py-2.5 font-mono text-xs text-paper transition-colors hover:border-blue"
        >
          <GoogleColor size={15} />
          Google
        </a>
      </div>

      <div className="my-5 flex items-center gap-3 font-mono text-[10px] text-grey">
        <span className="h-px flex-1 bg-line" />
        {t(locale, "login.emailDivider")}
        <span className="h-px flex-1 bg-line" />
      </div>

      <nav className="flex gap-1 font-mono text-[11px]">
        {(["login", "register"] as const).map((m) => (
          <a
            key={m}
            href={`/login?mode=${m}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`}
            aria-current={m === mode ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              m === mode ? "bg-paper text-bg" : "text-grey hover:bg-moon hover:text-paper"
            }`}
          >
            {t(locale, m === "login" ? "login.signIn" : "login.register")}
          </a>
        ))}
      </nav>

      {errorKey && (
        <p className="mt-4 rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">
          {t(locale, errorKey)}
        </p>
      )}

      {mode === "login" && (
        <form method="POST" action="/api/auth/email/login" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="email">
              {t(locale, "auth.email")}
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="block font-mono text-[10px] text-grey" htmlFor="password">
                {t(locale, "login.password")}
              </label>
              <a href="/login?mode=forgot" className="font-mono text-[10px] text-grey transition-colors hover:text-paper">
                {t(locale, "login.forgot")}
              </a>
            </div>
            <input id="password" name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </div>
          <button type="submit" className={submitCls}>
            <Mail size={12} className="mr-1 inline" /> {t(locale, "login.signIn")}
          </button>
        </form>
      )}

      {mode === "register" && (
        <form method="POST" action="/api/auth/email/register" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-email">
              {t(locale, "auth.email")}
            </label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-name">
              {t(locale, "login.displayName")}
            </label>
            <input id="reg-name" name="name" type="text" maxLength={64} autoComplete="nickname" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-password">
              {t(locale, "login.password8")}
            </label>
            <input id="reg-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-password2">
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
            <a
              href="/login?mode=forgot"
              className="inline-block font-mono text-[10px] text-grey transition-colors hover:text-paper"
            >
              <span className="inline-flex items-center gap-1.5">
                {t(locale, "login.resend")}
                <ArrowRight size={12} aria-hidden="true" />
              </span>
            </a>
          </div>
        ) : (
          <form method="POST" action="/api/auth/email/forgot" className="mt-4 space-y-3">
            <p className="text-xs leading-relaxed text-grey">
              {t(locale, "login.forgotIntro")}
            </p>
            <div>
              <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="forgot-email">
                {t(locale, "auth.email")}
              </label>
              <input id="forgot-email" name="email" type="email" required autoComplete="email" className={inputCls} />
            </div>
            <button type="submit" className={submitCls}>
              <Mail size={12} className="mr-1 inline" /> {t(locale, "login.sendReset")}
            </button>
          </form>
        ))}

      {mode === "reset" &&
        (token ? (
          <form method="POST" action="/api/auth/email/reset" className="mt-4 space-y-3">
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reset-password">
                {t(locale, "login.newPassword8")}
              </label>
              <input id="reset-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reset-password2">
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
            <a
              href="/login?mode=forgot"
              className="inline-block font-mono text-[10px] text-grey transition-colors hover:text-paper"
            >
              <span className="inline-flex items-center gap-1.5">
                {t(locale, "login.requestNew")}
                <ArrowRight size={12} aria-hidden="true" />
              </span>
            </a>
          </div>
        ))}

      {(mode === "forgot" || mode === "reset") && (
        <p className="mt-4 font-mono text-[10px]">
          <a href="/login" className="inline-flex items-center gap-1.5 text-grey transition-colors hover:text-paper">
            <ArrowLeft size={12} aria-hidden="true" />
            {t(locale, "login.backSignIn")}
          </a>
        </p>
      )}

      <p className="mt-6 text-[10px] leading-relaxed text-grey/80">
        {t(locale, "login.resetNote")}
      </p>
    </div>
  );
}
