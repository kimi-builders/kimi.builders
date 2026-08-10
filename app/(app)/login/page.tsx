/* 登录/注册页:GitHub / Google / 邮箱三入口。
   邮箱部分是无 JS 也能用的原生表单(303 回跳携带 error/next)。 */
import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { getLocale } from "@/src/lib/i18n-server";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "登录 — kimi.builders" };

const ERROR_TEXT: Record<string, { zh: string; en: string }> = {
  invalid_origin: { zh: "请求来源无效,请重试", en: "Invalid request origin. Try again." },
  rate_limited: { zh: "尝试太频繁,请稍后再试", en: "Too many attempts. Try again later." },
  invalid_email: { zh: "邮箱格式不正确", en: "Invalid email address." },
  too_short: { zh: "密码至少 8 位", en: "Password needs at least 8 characters." },
  too_long: { zh: "密码最长 72 位", en: "Password is limited to 72 characters." },
  password_mismatch: { zh: "两次输入的密码不一致", en: "Passwords do not match." },
  email_taken: { zh: "该邮箱已注册,直接登录即可", en: "Email already registered — just sign in." },
  bad_credentials: { zh: "邮箱或密码不正确", en: "Incorrect email or password." },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const sp = await searchParams;
  const next = safeReturnTo(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  if (user) redirect(next === "/" ? "/community" : next);

  const locale = await getLocale(null);
  const zh = locale === "zh";
  const mode = (Array.isArray(sp.mode) ? sp.mode[0] : sp.mode) === "register" ? "register" : "login";
  const errorCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const error = errorCode ? ERROR_TEXT[errorCode] : undefined;

  const inputCls =
    "w-full border border-line bg-bg px-3 py-2.5 text-sm text-paper outline-none focus:border-blue";
  const submitCls =
    "w-full border border-blue bg-blue px-4 py-2.5 font-mono text-xs font-semibold text-white hover:opacity-90";
  const oauthNext = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="font-mono text-lg font-semibold text-paper">
        {zh ? "登录 kimi.builders" : "Sign in to kimi.builders"}
      </h1>
      <p className="mt-2 text-xs leading-relaxed text-grey">
        {zh
          ? "发帖、作品、用量同步需要账号;浏览全站无需登录。"
          : "An account is needed for posting, works and usage sync; browsing needs none."}
      </p>

      <div className="mt-6 space-y-2">
        <a
          href={`/api/auth/github${oauthNext}`}
          className="flex items-center justify-center gap-2 border border-line px-4 py-2.5 font-mono text-xs text-paper transition-colors hover:border-blue"
        >
          GitHub
        </a>
        <a
          href={`/api/auth/google${oauthNext}`}
          className="flex items-center justify-center gap-2 border border-line px-4 py-2.5 font-mono text-xs text-paper transition-colors hover:border-blue"
        >
          Google
        </a>
      </div>

      <div className="my-5 flex items-center gap-3 font-mono text-[10px] text-grey">
        <span className="h-px flex-1 bg-line" />
        {zh ? "或用邮箱" : "or with email"}
        <span className="h-px flex-1 bg-line" />
      </div>

      <nav className="flex gap-1 font-mono text-[11px]">
        {(["login", "register"] as const).map((m) => (
          <a
            key={m}
            href={`/login?mode=${m}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`}
            aria-current={m === mode ? "page" : undefined}
            className={`px-3 py-1.5 transition-colors ${
              m === mode ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
            }`}
          >
            {m === "login" ? (zh ? "登录" : "Sign in") : zh ? "注册" : "Register"}
          </a>
        ))}
      </nav>

      {error && (
        <p className="mt-4 border border-red-500/40 px-3 py-2 text-xs text-red-400">
          {zh ? error.zh : error.en}
        </p>
      )}

      {mode === "login" ? (
        <form method="POST" action="/api/auth/email/login" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="email">
              {zh ? "邮箱" : "Email"}
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="password">
              {zh ? "密码" : "Password"}
            </label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </div>
          <button type="submit" className={submitCls}>
            <Mail size={12} className="mr-1 inline" /> {zh ? "登录" : "Sign in"}
          </button>
        </form>
      ) : (
        <form method="POST" action="/api/auth/email/register" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-email">
              {zh ? "邮箱" : "Email"}
            </label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-name">
              {zh ? "昵称(可选)" : "Display name (optional)"}
            </label>
            <input id="reg-name" name="name" type="text" maxLength={64} autoComplete="nickname" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-password">
              {zh ? "密码(至少 8 位)" : "Password (8+ chars)"}
            </label>
            <input id="reg-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] text-grey" htmlFor="reg-password2">
              {zh ? "确认密码" : "Confirm password"}
            </label>
            <input id="reg-password2" name="password2" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          </div>
          <button type="submit" className={submitCls}>
            <Mail size={12} className="mr-1 inline" /> {zh ? "注册并登录" : "Register & sign in"}
          </button>
        </form>
      )}

      <p className="mt-6 text-[10px] leading-relaxed text-grey/80">
        {zh
          ? "v0 暂不支持邮箱找回密码;忘记密码请联系管理员重置。"
          : "v0 has no self-serve password reset; contact an admin if you lose access."}
      </p>
    </div>
  );
}
