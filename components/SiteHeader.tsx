/* 内页通用顶栏:品牌锁up + 主导航 + 登录态。首页(coming-soon 门面)不用它。 */
import Link from "next/link";
import AuthChip from "./AuthChip";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-moon bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-6 px-5 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark.svg" alt="" className="h-6 w-6" />
          kimi<span className="text-blue">.</span>builders
        </Link>
        <nav className="flex items-center gap-4 font-mono text-xs text-grey">
          <Link href="/community" className="transition-colors hover:text-paper">
            社区
          </Link>
          <a
            href="https://github.com/kimi-builders"
            className="transition-colors hover:text-paper"
          >
            GitHub
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-4 font-mono text-xs">
          <AuthChip />
        </div>
      </div>
    </header>
  );
}
