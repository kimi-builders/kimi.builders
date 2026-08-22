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
      {/* eyebrow 补齐(20260821 文案一致性):与其他分区同源的「— 定位语」 */}
      <p className="kb-eyebrow mb-2">{t(locale, "about.eyebrow")}</p>
      <h1 className="text-2xl font-semibold text-paper">
        {t(locale, "about.title")}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-grey">
        {t(locale, "about.who")}
      </p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-grey">
        {t(locale, "about.whoMore")}
      </p>
      <p className="mt-5 border-l-2 border-blue pl-3 font-mono text-xs leading-relaxed text-paper">
        {t(locale, "about.quote")}
      </p>

      <h2 className="mt-8 font-mono text-xs tracking-[0.08em] text-grey">
        {t(locale, "about.whatTitle")}
      </h2>
      <div className="mt-3 divide-y divide-line border-y border-line">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-center gap-3 py-3 transition-colors"
          >
            <s.icon size={15} className="shrink-0 text-grey transition-colors group-hover:text-ui-blue" aria-hidden="true" />
            <span className="shrink-0 font-mono text-xs font-semibold text-paper transition-colors group-hover:text-ui-blue">
              {s.name}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-grey">
              {t(locale, s.key)}
            </span>
            <span className="shrink-0 font-mono text-xs text-grey transition-colors group-hover:text-ui-blue">→</span>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 font-mono text-xs tracking-[0.08em] text-grey">
        {t(locale, "about.linksTitle")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="text-paper underline decoration-ui-blue/50 underline-offset-4 transition-colors hover:text-ui-blue"
          >
            {l.label}
          </a>
        ))}
      </div>

      {/* 页尾收束(20260821 评审):关于页是犹豫者最后看的一页——以行动
          邀请结束,而不是以免责声明结束;human 衬线 + 门面标语语汇回声 */}
      <section className="mt-8 flex flex-col items-center border-t border-line pt-6 text-center">
        <p className="font-human text-lg leading-relaxed text-paper">
          {t(locale, "about.ctaLine")}
        </p>
        <p className="mt-1.5 font-mono text-xs tracking-[0.08em] text-grey">
          EXPLORE TOGETHER. BUILD TOGETHER.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 font-mono text-xs">
          <Link
            href="/community"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue px-5 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "home.cta")} →
          </Link>
          <a
            href="https://github.com/kimi-builders"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 text-grey transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "about.ctaGithub")} →
          </a>
        </div>
      </section>

      <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-grey/80">
        {t(locale, "about.disclaimer")}
      </p>
    </div>
  );
}
