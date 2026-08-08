/* Coming-soon 门面 —— 站点正式版规划见 docs/plan.md。
   hero 用 SMIL 动画版 Logo(双星 8s 绕轨,<img> 内 SMIL 现代浏览器可播)。
   右上角是登录态:未登录给 GitHub / Google 入口,已登录显示 @handle + 退出。 */
import { getSessionUser } from "@/src/lib/auth/session";

const LINKS = [
  { href: "https://github.com/kimi-builders", label: "GitHub" },
  { href: "https://github.com/kimi-builders/awesome-kimi-builders", label: "Awesome" },
  { href: "https://github.com/kimi-builders/discussions", label: "Discussions" },
  { href: "mailto:hi@kimi.builders", label: "hi@kimi.builders" },
];

const AUTH_ERRORS: Record<string, string> = {
  state_mismatch: "登录状态校验失败,请重试。",
  oauth_failed: "OAuth 授权失败,请重试或换另一种登录方式。",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ auth_error: authError }, user] = await Promise.all([
    searchParams,
    getSessionUser(),
  ]);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="absolute right-5 top-5 flex items-center gap-4 font-mono text-xs">
        {user ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt=""
              className="h-7 w-7 rounded-full border border-paper/20"
            />
            <span className="text-paper">@{user.handle}</span>
            <a
              href="/api/auth/logout"
              className="text-grey underline underline-offset-4 transition-colors hover:text-blue"
            >
              退出
            </a>
          </>
        ) : (
          <>
            <span className="text-grey">登录</span>
            <a
              href="/api/auth/github"
              className="text-paper underline decoration-blue/60 underline-offset-4 transition-colors hover:text-blue"
            >
              GitHub
            </a>
            <a
              href="/api/auth/google"
              className="text-paper underline decoration-blue/60 underline-offset-4 transition-colors hover:text-blue"
            >
              Google
            </a>
          </>
        )}
      </div>
      {typeof authError === "string" && (
        <p className="absolute top-16 font-mono text-xs text-blue">
          {AUTH_ERRORS[authError] ?? "登录失败,请重试。"}
        </p>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-animated.svg"
        alt="kimi.builders — a paper crescent on the dark side of the moon, with two companion stars in orbit"
        className="h-44 w-44"
      />
      <h1 className="mt-10 font-mono text-4xl font-semibold tracking-wide">
        kimi<span className="text-blue">.</span>builders
      </h1>
      <p className="mt-5 font-mono text-sm tracking-[0.24em] text-paper">
        BUILD GOOD THINGS WITH KIMI<span className="text-blue">.</span>
      </p>
      <p className="mt-3 text-lg font-medium">用 Kimi,构建美好。</p>
      <p className="mt-8 font-mono text-xs tracking-[0.3em] text-grey">
        EXPLORE TOGETHER. BUILD TOGETHER.
      </p>
      <p className="mt-2 text-sm text-grey">并肩探索,一起构建。社区站点建设中。</p>

      <nav className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-mono text-sm">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="text-paper underline decoration-blue/60 underline-offset-8 transition-colors hover:text-blue"
          >
            {l.label}
          </a>
        ))}
      </nav>

      <footer className="absolute bottom-6 max-w-xl px-6 text-xs leading-relaxed text-grey">
        kimi.builders is a user-built, non-commercial community. Not affiliated
        with, sponsored, or endorsed by Moonshot AI(月之暗面).
      </footer>
    </main>
  );
}
