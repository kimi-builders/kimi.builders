/* 关于页(/about):我们是谁 / 这里有什么(分区内链)/ 口号 / 联系与链接 / 非官方声明。
   平铺在 (app) 壳内,回落 community 右栏;文案全走 i18n。 */
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, GalleryVerticalEnd, MessagesSquare, Star } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";

export const metadata: Metadata = { title: "关于 — kimi.builders" };

export default async function AboutPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  const sections = [
    { href: "/community", icon: MessagesSquare, key: "about.whatCommunity" as const, name: t(locale, "nav.community") },
    { href: "/works", icon: GalleryVerticalEnd, key: "about.whatWorks" as const, name: t(locale, "nav.works") },
    { href: "/awesome", icon: Star, key: "about.whatAwesome" as const, name: t(locale, "nav.awesome") },
    { href: "/usage", icon: BarChart3, key: "about.whatUsage" as const, name: t(locale, "nav.usage") },
  ];
  const links = [
    { href: "https://github.com/kimi-builders", label: "GitHub" },
    { href: "https://github.com/kimi-builders/awesome-kimi-builders", label: "Awesome" },
    { href: "mailto:hi@kimi.builders", label: "hi@kimi.builders" },
  ];

  return (
    <div className="rounded-2xl border border-line bg-card p-5 sm:p-8">
      <h1 className="text-[22px] font-semibold tracking-[0.2px] text-paper">
        {t(locale, "about.title")}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-grey">
        {t(locale, "about.who")}
      </p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-grey">
        {t(locale, "about.whoMore")}
      </p>
      <div className="mt-5 space-y-1.5 border-l-2 border-blue pl-3 font-mono text-[12px] leading-relaxed">
        <p className="text-paper">{t(locale, "works.slogan")}</p>
        <p className="text-grey">{t(locale, "about.quote")}</p>
      </div>

      <h2 className="mt-8 font-mono text-[11px] tracking-[0.25em] text-grey">
        {t(locale, "about.whatTitle")}
      </h2>
      <div className="mt-3 divide-y divide-line border-y border-line">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-center gap-3 py-3 transition-colors"
          >
            <s.icon size={15} className="shrink-0 text-grey transition-colors group-hover:text-blue" aria-hidden="true" />
            <span className="shrink-0 font-mono text-xs font-semibold text-paper transition-colors group-hover:text-blue">
              {s.name}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-grey">
              {t(locale, s.key)}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-grey transition-colors group-hover:text-blue">→</span>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 font-mono text-[11px] tracking-[0.25em] text-grey">
        {t(locale, "about.linksTitle")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="text-paper underline decoration-blue/50 underline-offset-4 transition-colors hover:text-blue"
          >
            {l.label}
          </a>
        ))}
      </div>

      <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-grey/80">
        {t(locale, "about.disclaimer")}
      </p>
    </div>
  );
}
