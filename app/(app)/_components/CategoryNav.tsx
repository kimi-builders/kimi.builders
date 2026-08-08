"use client";

/* 右栏「浏览社区」widget:全部讨论 / 我的订阅 + 板块列表(从原左栏搬来)。
   客户端组件:useSearchParams 读 cat/sub 做激活态。 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, Hash, MessagesSquare } from "lucide-react";
import { CATEGORIES } from "@/src/lib/categories";
import { t, type Locale } from "@/src/lib/i18n";

export default function CategoryNav({
  loggedIn,
  locale,
}: {
  loggedIn: boolean;
  locale: Locale;
}) {
  const sp = useSearchParams();
  const cat = sp.get("cat") ?? "";
  const sub = sp.get("sub") === "1";

  const itemCls = (active: boolean) =>
    `flex items-center gap-2.5 border-l-2 px-2.5 py-1.5 font-mono text-xs transition-colors ${
      active
        ? "border-blue text-paper"
        : "border-transparent text-grey hover:text-paper"
    }`;

  return (
    <nav className="space-y-0.5">
      <Link href="/community" className={itemCls(!cat && !sub)}>
        <MessagesSquare size={13} className="shrink-0" />
        {t(locale, "side.all")}
      </Link>
      {loggedIn && (
        <Link href="/community?sub=1" className={itemCls(sub)}>
          <Bookmark size={13} className="shrink-0" />
          {t(locale, "side.subs")}
        </Link>
      )}
      <div className="my-2 border-t border-moon" />
      {CATEGORIES.map((c) => (
        <Link
          key={c.id}
          href={`/community?cat=${c.id}`}
          className={itemCls(cat === c.id)}
        >
          <Hash size={12} className="shrink-0" />
          {locale === "zh" ? c.zh : c.en}
        </Link>
      ))}
    </nav>
  );
}
