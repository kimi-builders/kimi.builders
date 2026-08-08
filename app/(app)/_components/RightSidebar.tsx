/* 社区右栏(仅 ≥xl):浏览社区(全部/订阅/板块)+ 关于 / 7 日热门 / 社区数据 /
   新成员,全部真实数据。用户可整体关掉(留细轨可重开)。
   隐藏/显示纯 CSS 驱动(html[data-sidebar],见 globals.css):两种状态的结构
   常渲染,切换零网络;SSR 首屏按 cookie 直出同一状态。 */
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getSidebarData } from "@/src/lib/posts";
import { t, type Locale } from "@/src/lib/i18n";
import CategoryNav from "./CategoryNav";
import { SidebarToggle } from "./pref-controls";

function Widget({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-card p-4">
      <h3 className="font-mono text-[10px] tracking-[0.25em] text-grey">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function RightSidebar({
  locale,
  loggedIn,
}: {
  locale: Locale;
  loggedIn: boolean;
}) {
  const data = await getSidebarData();
  return (
    <aside className="rightsidebar sticky top-8 hidden xl:block">
      <div className="sidebar-full w-72 shrink-0 space-y-4">
        <Widget title={t(locale, "side.browse")}>
          <CategoryNav loggedIn={loggedIn} locale={locale} />
        </Widget>

        <Widget title={t(locale, "side.about")}>
          <p className="text-xs leading-relaxed text-grey">
            {t(locale, "side.aboutBody")}
          </p>
          <div className="mt-3 flex gap-4 font-mono text-[11px]">
            <a
              href="https://github.com/kimi-builders"
              className="text-grey underline decoration-blue/50 underline-offset-4 hover:text-blue"
            >
              GitHub
            </a>
            <a
              href="https://github.com/kimi-builders/awesome-kimi-builders"
              className="text-grey underline decoration-blue/50 underline-offset-4 hover:text-blue"
            >
              Awesome
            </a>
          </div>
        </Widget>

        <Widget title={t(locale, "side.hot")}>
          {data.hot.length === 0 ? (
            <p className="text-xs text-grey">{t(locale, "side.hotEmpty")}</p>
          ) : (
            <ul className="space-y-2.5">
              {data.hot.map((h, i) => (
                <li key={h.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-mono text-[10px] text-grey">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={`/community/${h.id}`}
                    className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-blue"
                  >
                    {h.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-grey">
                    <MessageCircle size={11} />
                    {h.commentCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title={t(locale, "side.stats")}>
          <div className="flex justify-between">
            {[
              { n: data.stats.members, l: t(locale, "side.members") },
              { n: data.stats.posts, l: t(locale, "side.posts") },
              { n: data.stats.comments, l: t(locale, "side.comments") },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-mono text-lg font-semibold text-paper">
                  {s.n}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-grey">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </Widget>

        <Widget title={t(locale, "side.newMembers")}>
          <div className="flex gap-2">
            {data.newMembers.map((m) => (
              <span key={m.handle} title={`@${m.handle}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.avatarUrl}
                  alt={`@${m.handle}`}
                  className="h-7 w-7 rounded-full border border-paper/10"
                />
              </span>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-grey">
            {data.newMembers.map((m) => `@${m.handle}`).join(" ")}
          </p>
        </Widget>

        <SidebarToggle variant="full" locale={locale} />
      </div>

      {/* 隐藏后留下的细轨重开按钮(CSS 按 html[data-sidebar] 二选一显示) */}
      <div className="sidebar-rail">
        <SidebarToggle variant="rail" locale={locale} />
      </div>
    </aside>
  );
}
