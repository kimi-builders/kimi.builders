/* 社区 feed 右栏:浏览社区(全部/订阅/板块)+ 关于 / 编辑精选 / Demo Night /
   7 日热门 / 社区数据 / 新成员,全部真实数据 —— 原 RightSidebar 写死的那套,
   注册表里它是 community kind,也是未列出路由的回落(见 right-rail.ts)。
   编辑精选(每周精选 v0):冷启动没有任何精选时整个 widget 不渲染。
   Demo Night:无 upcoming 场次时整个 widget 不渲染;报名态走 getSessionUser
   (React cache 与布局壳去重,不多查库)。 */
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import { getSessionUser } from "@/src/lib/auth/session";
import { formatEventTime, getUpcomingSummary } from "@/src/lib/demo-night";
import { getFeaturedFeed } from "@/src/lib/featured";
import { getSidebarData } from "@/src/lib/posts";
import { t, type Locale } from "@/src/lib/i18n";
import CategoryNav from "../CategoryNav";
import Widget from "./Widget";

export default async function CommunityWidgets({
  locale,
  loggedIn,
}: {
  locale: Locale;
  loggedIn: boolean;
}) {
  const user = await getSessionUser();
  const [data, featured, demoNight] = await Promise.all([
    getSidebarData(),
    getFeaturedFeed(3),
    getUpcomingSummary(user?.id ?? null),
  ]);
  return (
    <>
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

      {featured.length > 0 && (
        <Widget title={t(locale, "side.featured")}>
          <ul className="space-y-3">
            {featured.map((f) => {
              const title = f.external ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-paper transition-colors hover:text-blue"
                >
                  {f.title}
                </a>
              ) : (
                <Link
                  href={f.href}
                  className="block truncate text-xs text-paper transition-colors hover:text-blue"
                >
                  {f.title}
                </Link>
              );
              return (
                <li key={`${f.kind}-${f.id}`}>
                  {title}
                  <p
                    className="mt-0.5 truncate text-[11px] leading-relaxed text-grey"
                    title={f.reason}
                  >
                    {f.reason}
                  </p>
                  {f.editorHandle && (
                    <p className="mt-0.5 font-mono text-[10px] text-grey">
                      {t(locale, "featured.by", { handle: f.editorHandle })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      {/* Demo Night:当前场日期 + 报名状态/人数 + 链接;无当前场不渲染 */}
      {demoNight && (
        <Widget title={t(locale, "dn.widgetTitle")}>
          <Link
            href="/demo-night"
            className="block truncate text-xs text-paper transition-colors hover:text-blue"
          >
            {demoNight.event.title}
          </Link>
          <p className="mt-1 font-mono text-[10px] text-blue">
            {formatEventTime(demoNight.event.startsAt)}
          </p>
          <p className="mt-1.5 font-mono text-[10px] text-grey">
            {t(locale, "dn.rosterCount", { n: demoNight.rsvpCount })}
            {" · "}
            {demoNight.rsvped
              ? t(locale, "dn.widgetRsvped")
              : t(locale, "dn.widgetCta")}
          </p>
        </Widget>
      )}

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
            <Link key={m.handle} href={`/u/${m.handle}`} title={`@${m.handle}`}>
              <Avatar
                url={m.avatarUrl}
                handle={m.handle}
                size={28}
                className="transition-colors hover:border-blue hover:text-blue"
              />
            </Link>
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-grey">
          {data.newMembers.map((m) => `@${m.handle}`).join(" ")}
        </p>
      </Widget>
    </>
  );
}
