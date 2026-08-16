/* 未开发分区的占位页(learn / works / usage / awesome 共用):
   大图标 + 分区名 + 「这块还在建」+ 规划条目 + 回社区 CTA。
   路由先立着,左栏/移动栏的入口不再是死链;正式开发时整页替换即可。 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function SoonPage({
  icon: Icon,
  name,
  desc,
  items,
  locale,
}: {
  icon: LucideIcon;
  name: string;
  desc: string;
  items: string[];
  locale: Locale;
}) {
  return (
    <div className="border border-line bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="border border-line p-2.5 text-grey">
          <Icon size={20} />
        </span>
        <div>
          <h1 className="font-mono text-lg font-semibold text-paper">{name}</h1>
          <p className="font-mono text-[11px] tracking-[0.25em] text-blue">
            {t(locale, "soon.headline")}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-grey">{desc}</p>
      <h2 className="mt-6 font-mono text-[11px] tracking-[0.25em] text-grey">
        {t(locale, "soon.planned")}
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li
            key={it}
            className="flex items-center gap-2 font-mono text-xs text-paper/80"
          >
            <span className="text-blue">·</span>
            {it}
          </li>
        ))}
      </ul>
      <Link
        href="/community"
        className="mt-6 inline-block border border-blue px-5 py-2 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
      >
        {t(locale, "soon.cta")}
      </Link>
    </div>
  );
}
