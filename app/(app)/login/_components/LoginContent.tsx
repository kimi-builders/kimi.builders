/* 登录/注册主体:完整页(/login)与弹窗(@modal/(.)login)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏,标题随模式变,见 loginModeOf)。
   GitHub / Google / 邮箱三入口;邮箱部分是无 JS 也能用的原生表单(303 回跳
   携带 error/next)。已登录访问直接 redirect(next)——在拦截路由里同样生效。
   版式(20260919 重排):说明文字按模式出现——OAuth 区/分隔线/登录注册页签
   只在 login/register 渲染(forgot/reset 是纯邮箱流,不再混入无关元素);
   重置规则小字只出现在找回密码表单下,登录/注册底部保持干净;
   页签用站内标准 segmented 控件(与排序/视图切换同款)。 */
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

/* URL 的 mode 收敛(弹窗标题与主体共用同一解析,避免两处口径漂移) */
export function loginModeOf(sp: Record<string, string | string[] | undefined>): LoginMode {
  const raw = Array.isArray(sp.mode) ? sp.mode[0] : sp.mode;
  return raw === "register" || raw === "forgot" || raw === "reset" ? raw : "login";
}

/* 模式 → 标题键(弹窗标题栏 / 完整页 h1 共用) */
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
  /* OAuth 与页签只属于登录/注册(forgot/reset 是纯邮箱流) */
  const emailOnly = mode === "forgot" || mode === "reset";

  const inputCls =
    "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper outline-none focus:border-blue focus:ring-4 focus:ring-blue/10";
  const submitCls =
    "w-full rounded-lg bg-blue px-4 py-2.5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 hover:opacity-90";

  return (
    <div className={`mx-auto max-w-sm ${showTitle ? "rounded-2xl border border-line bg-card p-5 sm:p-6" : ""}`}>
      {showTitle && (
        <h1 className="font-mono text-lg font-semibold text-paper">
          {t(locale, loginTitleKey(mode))}
        </h1>
      )}
      {/* 说明文字按模式一句话(20260919):登录/注册各说各的,
          forgot/reset 的说明在各自表单里,不再全局一句长句 */}
      {!emailOnly && (
        <p className={`text-[11px] leading-relaxed text-grey ${showTitle ? "mt-2" : ""}`}>
          {t(locale, mode === "register" ? "login.registerSubtitle" : "login.subtitle")}
        </p>
      )}

      {/* OAuth 入口:共享件(与各受限页引导卡同源,20260919) */}
      {!emailOnly && (
        <div className="mt-6 space-y-2">
          <OAuthButtons next={next} block />
        </div>
      )}

      {!emailOnly && (
        <div className="my-5 flex items-center gap-3 font-mono text-[11px] text-grey">
          <span className="h-px flex-1 bg-line" />
          {t(locale, "login.emailDivider")}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      {/* 模式切换全部走 Link 软导航(20260919):原生 <a> 是硬导航,
          会绕过拦截路由——弹窗里点页签直接变完整页(宽度/形态跳变)。
          Link 只变 searchParams,弹窗保持挂载,内容原地切换 */}
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
        <form method="POST" action="/api/auth/email/login" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="email">
              {t(locale, "auth.email")}
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="block font-mono text-[11px] text-grey" htmlFor="password">
                {t(locale, "login.password")}
              </label>
              <Link
                href="/login?mode=forgot"
                className="font-mono text-[11px] text-grey transition-colors hover:text-paper"
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
        <form method="POST" action="/api/auth/email/register" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="reg-email">
              {t(locale, "auth.email")}
            </label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="reg-name">
              {t(locale, "login.displayName")}
            </label>
            <input id="reg-name" name="name" type="text" maxLength={64} autoComplete="nickname" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="reg-password">
              {t(locale, "login.password8")}
            </label>
            <input id="reg-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="reg-password2">
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
              href="/login?mode=forgot"
              className="inline-block font-mono text-[11px] text-grey transition-colors hover:text-paper"
            >
              <span className="inline-flex items-center gap-1.5">
                {t(locale, "login.resend")}
                <ArrowRight size={12} aria-hidden="true" />
              </span>
            </Link>
          </div>
        ) : (
          <form method="POST" action="/api/auth/email/forgot" className="mt-4 space-y-3">
            <p className="text-[11px] leading-relaxed text-grey">
              {t(locale, "login.forgotIntro")}
            </p>
            <div>
              <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="forgot-email">
                {t(locale, "auth.email")}
              </label>
              <input id="forgot-email" name="email" type="email" required autoComplete="email" className={inputCls} />
            </div>
            <button type="submit" className={submitCls}>
              <Mail size={12} className="mr-1 inline" /> {t(locale, "login.sendReset")}
            </button>
            {/* 重置规则(20260919 收编于此,原先全局底栏与登录/注册无关) */}
            <p className="font-mono text-[11px] leading-relaxed text-grey/80">
              · {t(locale, "login.resetRule")}
              <br />· {t(locale, "login.resetContact")}
            </p>
          </form>
        ))}

      {mode === "reset" &&
        (token ? (
          <form method="POST" action="/api/auth/email/reset" className="mt-4 space-y-3">
            <input type="hidden" name="token" value={token} />
            <div>
              <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="reset-password">
                {t(locale, "login.newPassword8")}
              </label>
              <input id="reset-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[11px] text-grey" htmlFor="reset-password2">
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
              href="/login?mode=forgot"
              className="inline-block font-mono text-[11px] text-grey transition-colors hover:text-paper"
            >
              <span className="inline-flex items-center gap-1.5">
                {t(locale, "login.requestNew")}
                <ArrowRight size={12} aria-hidden="true" />
              </span>
            </Link>
          </div>
        ))}

      {(mode === "forgot" || mode === "reset") && (
        <p className="mt-4 font-mono text-[11px]">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-grey transition-colors hover:text-paper">
            <ArrowLeft size={12} aria-hidden="true" />
            {t(locale, "login.backSignIn")}
          </Link>
        </p>
      )}
    </div>
  );
}
