/* Login invitation card: the unified face of gated pages when signed
   out — the site's only login UI lives at /login (intercepted
   modal/full page); this card only guides: one line of context copy +
   a blue primary button into the login modal (carrying next) + OAuth
   quick entries below (the same OAuthButtons as the login page).
   Before, /usage, /community/new, /works/new each built their own
   login gates — three styles, three capabilities (the post page even
   lacked email login); unified, a direct URL shows the same face.
   Rail entries link straight to /login when signed out (in-app =
   modal); this card backstops direct opens/refreshes. */
import Link from "next/link";
import { LogIn } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import OAuthButtons from "@/components/OAuthButtons";

export default function LoginGate({
  locale,
  title,
  next,
}: {
  locale: Locale;
  /* Context copy: what login unlocks (callers pass t() results). */
  title: string;
  /* The redirect target (the current page). */
  next: string;
}) {
  const query = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="rounded-2xl border border-line bg-card p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-moon text-ui-blue">
        <LogIn size={22} aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm leading-relaxed text-paper">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-grey">
        {t(locale, "gate.hint")}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {/* Link 软导航(20260919):应用内点击走拦截路由弹出登录弹窗;
            原生 <a> 会硬导航成完整页,形态跳变 */}
        <Link
          href={`/login${query}`}
 className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "gate.login")}
        </Link>
        <OAuthButtons next={next} />
      </div>
    </div>
  );
}
