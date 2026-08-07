/* Coming-soon 门面 —— 站点正式版规划见 docs/plan.md。
   hero 用 SMIL 动画版 Logo(双星 8s 绕轨,<img> 内 SMIL 现代浏览器可播)。 */

const LINKS = [
  { href: "https://github.com/kimi-builders", label: "GitHub" },
  { href: "https://github.com/kimi-builders/awesome-kimi-builders", label: "Awesome" },
  { href: "https://github.com/kimi-builders/discussions", label: "Discussions" },
  { href: "mailto:hi@kimi.builders", label: "hi@kimi.builders" },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
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
