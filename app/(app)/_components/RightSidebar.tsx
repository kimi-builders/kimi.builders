/* 社区右栏(仅 ≥xl):浏览社区(全部/订阅/板块)+ 关于 / 7 日热门 / 社区数据 /
   新成员,全部真实数据。用户可整体关掉(cookie kb_sidebar=0),关掉后留细轨可重开。 */
import Link from "next/link";
import { MessageCircle, PanelRightClose, PanelRightOpen } from "lucide-react";
import { getSidebarData } from "@/src/lib/posts";
import { t, type Locale } from "@/src/lib/i18n";
import { toggleSidebarAction } from "../community/actions";
import CategoryNav from "./CategoryNav";

function Widget({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-moon bg-card p-4">
      <h3 className="font-mono text-[10px] tracking-[0.25em] text-grey">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function RightSidebar({
  hidden,
  locale,
  loggedIn,
}: {
  hidden: boolean;
  locale: Locale;
  loggedIn: boolean;
}) {
  if (hidden) {
    return (
      <aside className="sticky top-8 hidden xl:block">
        <form action={toggleSidebarAction}>
          <button
            type="submit"
            title={t(locale, "side.show")}
            className="border border-moon p-2 text-grey transition-colors hover:border-blue hover:text-blue"
          >
            <PanelRightOpen size={15} />
          </button>
        </form>
      </aside>
    );
  }

  const data = await getSidebarData();
  return (
    <aside className="sticky top-8 hidden w-72 shrink-0 xl:block">
      <div className="space-y-4">
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

        <form action={toggleSidebarAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 font-mono text-[10px] text-grey transition-colors hover:text-paper"
          >
            <PanelRightClose size={12} />
            {t(locale, "side.hide")}
          </button>
        </form>
      </div>
    </aside>
  );
}
