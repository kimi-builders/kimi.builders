/* <lg 的顶部 mini 栏:品牌 + 社区/发帖 + 登录态。
   桌面三栏壳(LeftNav/RightSidebar)在移动端整体让位给它。 */
import Link from "next/link";
import AuthChip from "@/components/AuthChip";

export default function MobileTopBar() {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-5 border-b border-moon bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link
        href="/"
        className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-mark.svg" alt="" className="h-5 w-5" />
        kimi<span className="text-blue">.</span>builders
      </Link>
      <nav className="flex gap-4 font-mono text-xs text-grey">
        <Link href="/community" className="transition-colors hover:text-paper">
          社区
        </Link>
        <Link
          href="/community/new"
          className="transition-colors hover:text-paper"
        >
          发帖
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-4 font-mono text-xs">
        <AuthChip />
      </div>
    </div>
  );
}
