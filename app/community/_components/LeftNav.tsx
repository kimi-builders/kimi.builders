"use client";

/* 社区左栏:品牌锁up + 发帖 CTA + 主导航(全部讨论/我的订阅)+ 板块列表 +
   底部外联与收起开关。收起后收成图标轨(导航永远可达)。
   客户端组件:要用 usePathname/useSearchParams 做激活态(蓝边 rail)。 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bookmark,
  Hash,
  Info,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
} from "lucide-react";
import { CATEGORIES } from "@/src/lib/categories";
import { toggleNavAction } from "../actions";

/* GitHub 品牌字形(Lucide 已移除品牌图标;取自 SimpleIcons,CC0) */
function GithubIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

interface NavUser {
  handle: string;
  avatarUrl: string;
}

export default function LeftNav({
  user,
  collapsed,
}: {
  user: NavUser | null;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const cat = sp.get("cat") ?? "";
  const sub = sp.get("sub") === "1";

  const itemCls = (active: boolean) =>
    `flex items-center gap-3 border-l-2 py-2 font-mono text-xs transition-colors ${
      collapsed ? "justify-center px-0" : "px-3"
    } ${
      active
        ? "border-blue text-paper"
        : "border-transparent text-grey hover:text-paper"
    }`;

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto py-6 lg:flex ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      <Link
        href="/"
        title="kimi.builders"
        className={`flex items-center gap-2 font-mono text-sm font-semibold tracking-wide ${
          collapsed ? "justify-center" : "px-3"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-mark.svg" alt="" className="h-6 w-6 shrink-0" />
        {!collapsed && (
          <span>
            kimi<span className="text-blue">.</span>builders
          </span>
        )}
      </Link>

      <Link
        href="/community/new"
        title="发帖"
        className={`mt-6 flex items-center gap-2 border border-blue py-2 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg ${
          collapsed ? "justify-center px-0" : "justify-center"
        }`}
      >
        <SquarePen size={14} className="shrink-0" />
        {!collapsed && "发帖"}
      </Link>

      <nav className="mt-6 space-y-1">
        <Link
          href="/community"
          title="全部讨论"
          className={itemCls(pathname === "/community" && !cat && !sub)}
        >
          <MessagesSquare size={15} className="shrink-0" />
          {!collapsed && "全部讨论"}
        </Link>
        {user && (
          <Link
            href="/community?sub=1"
            title="我的订阅"
            className={itemCls(sub)}
          >
            <Bookmark size={15} className="shrink-0" />
            {!collapsed && "我的订阅"}
          </Link>
        )}
      </nav>

      <p
        className={`mt-8 font-mono text-[10px] tracking-[0.25em] text-grey/70 ${
          collapsed ? "text-center" : "px-3"
        }`}
      >
        {collapsed ? "···" : "板块"}
      </p>
      <nav className="mt-2 space-y-1">
        {CATEGORIES.map((c) => (
          <Link
            key={c.id}
            href={`/community?cat=${c.id}`}
            title={c.zh}
            className={itemCls(cat === c.id)}
          >
            <Hash size={14} className="shrink-0" />
            {!collapsed && c.zh}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-1 pt-8">
        <a
          href="https://github.com/kimi-builders"
          title="GitHub"
          className={itemCls(false)}
        >
          <GithubIcon size={15} />
          {!collapsed && "GitHub"}
        </a>
        <Link href="/" title="关于" className={itemCls(false)}>
          <Info size={15} className="shrink-0" />
          {!collapsed && "关于"}
        </Link>
        <form action={toggleNavAction}>
          <button
            type="submit"
            title={collapsed ? "展开导航" : "收起导航"}
            className={`${itemCls(false)} w-full`}
          >
            {collapsed ? (
              <PanelLeftOpen size={15} className="shrink-0" />
            ) : (
              <>
                <PanelLeftClose size={15} className="shrink-0" />
                收起导航
              </>
            )}
          </button>
        </form>
      </div>
    </aside>
  );
}
