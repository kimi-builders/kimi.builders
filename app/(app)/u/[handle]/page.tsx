/* 个人主页 /u/[handle]:资料头(头像/显示名/handle/简介/加入时间)+ 三项统计
   (帖子/评论/获赞)+ 年度构建足迹(53 周每日 token 贡献图,S2-3)
   + 帖子|评论|作品|用量页签(P1-3)。本人视角多一颗「编辑资料」
   入口(去 /settings),且能看到自己的私密帖(带标);访客只统计/展示公开内容。
   作品本来就公开,访客与本人同视图;构建足迹与用量热图仅本人或对方自愿公开
   (usage_settings.show_on_leaderboard=1)时可见,否则整块完全不渲染(无负面标记)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowBigUp, CalendarDays, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getUserComments, getUserPosts } from "@/src/lib/posts";
import { getProfileByHandle, getProfileStats } from "@/src/lib/users";
import {
  getSocialDailyActivity,
  getSocialUsageHeatmap,
  isUsagePublic,
} from "@/src/lib/usage/social";
import { buildYearGrid, localTodayYmd } from "@/src/lib/usage/year-grid";
import { getUserWorks } from "@/src/lib/works";
import WorkCard from "../../works/_components/WorkCard";
import SocialUsageHeatmap from "./_components/SocialUsageHeatmap";
import YearFootprint from "./_components/YearFootprint";

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const p = await getProfileByHandle(handle);
  if (!p) return { title: "kimi.builders" };
  return { title: `${p.name || p.handle} (@${p.handle}) — kimi.builders` };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { handle } = await params;
  const { tab } = await searchParams;
  const me = await getSessionUser();
  const locale = await getLocale(me);
  const profile = await getProfileByHandle(handle);

  if (!profile) {
    return (
      <p className="mt-16 text-center text-sm text-grey">
        {t(locale, "prof.notFound")}
      </p>
    );
  }

  const self = me?.id === profile.id;
  /* 用量热图页签:本人恒可见;访客仅当对方 opt-in 公开。未公开 = 页签不渲染。 */
  const usageVisible = self || (await isUsagePublic(profile.id));
  const activeTab =
    tab === "comments" || tab === "works" || (tab === "usage" && usageVisible)
      ? tab
      : "posts";
  /* 分时热图的「本地」跟浏览器 kb_tz cookie(同用量看板);无 cookie 按 GMT+0 */
  const store = await cookies();
  const parsedTz = Number(store.get("kb_tz")?.value);
  const tz = Number.isFinite(parsedTz) ? parsedTz : 0;
  const [stats, posts, comments, works, heatmap, daily] = await Promise.all([
    getProfileStats(profile.id, self),
    activeTab === "posts" ? getUserPosts(profile.id, self) : Promise.resolve([]),
    activeTab === "comments" ? getUserComments(profile.id, self) : Promise.resolve([]),
    activeTab === "works" ? getUserWorks(profile.id) : Promise.resolve([]),
    activeTab === "usage"
      ? getSocialUsageHeatmap(profile.id, tz)
      : Promise.resolve(null),
    /* 年度构建足迹:门禁同分时热图(仅本人或对方 opt-in),与页签无关恒取 */
    usageVisible ? getSocialDailyActivity(profile.id, tz) : Promise.resolve(null),
  ]);
  const footprint = daily ? buildYearGrid(daily, localTodayYmd(tz)) : null;

  const tabCls = (active: boolean) =>
    `pb-2 transition-colors ${
      active
        ? "text-paper underline decoration-blue underline-offset-8"
        : "text-grey hover:text-paper"
    }`;

  return (
    <div>
      {/* 资料头 */}
      <header className="border border-line bg-card p-5">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full border border-paper/15"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-paper">
              {profile.name || profile.handle}
            </h1>
            <p className="font-mono text-xs text-grey">
              @{profile.handle}
              {profile.role !== "member" && (
                <span className="ml-2 border border-blue px-1 py-px text-[9px] tracking-wider text-blue">
                  {profile.role.toUpperCase()}
                </span>
              )}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-grey">
              <CalendarDays size={12} />
              {t(locale, "prof.joined", { d: ymd(profile.createdAt) })}
            </p>
          </div>
          {self && (
            <Link
              href="/settings"
              className="shrink-0 border border-line px-3 py-1.5 font-mono text-xs text-paper transition-colors hover:border-blue hover:text-blue"
            >
              {t(locale, "prof.edit")}
            </Link>
          )}
        </div>
        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-paper/90">
            {profile.bio}
          </p>
        )}
        <div className="mt-4 flex gap-6 border-t border-line pt-3">
          {[
            { n: stats.posts, l: t(locale, "prof.posts") },
            { n: stats.comments, l: t(locale, "prof.comments") },
            { n: stats.likes, l: t(locale, "prof.likes") },
          ].map((s) => (
            <div key={s.l} className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold text-paper">
                {s.n}
              </span>
              <span className="font-mono text-[11px] text-grey">{s.l}</span>
            </div>
          ))}
        </div>
      </header>

      {/* 年度构建足迹:53 周 × 7 天每日 token 贡献图;门禁同用量页签
          (仅本人或对方 opt-in),未公开整区块不渲染(无负面标记) */}
      {footprint && (
        <section className="mt-6 border border-line bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-mono text-xs tracking-[0.25em] text-grey">
              {t(locale, "prof.footprint")}
            </h2>
            <span className="font-mono text-[10px] text-grey">
              {t(locale, "prof.footprintHint")}
            </span>
          </div>
          <div className="mt-3">
            <YearFootprint grid={footprint} zh={locale === "zh"} />
          </div>
        </section>
      )}

      {/* 页签 */}
      <div className="mt-6 flex items-center gap-5 border-b border-line font-mono text-sm">
        <Link href={`/u/${profile.handle}`} className={tabCls(activeTab === "posts")}>
          {t(locale, "prof.posts")}
        </Link>
        <Link
          href={`/u/${profile.handle}?tab=comments`}
          className={tabCls(activeTab === "comments")}
        >
          {t(locale, "prof.comments")}
        </Link>
        <Link
          href={`/u/${profile.handle}?tab=works`}
          className={tabCls(activeTab === "works")}
        >
          {t(locale, "prof.works")}
        </Link>
        {usageVisible && (
          <Link
            href={`/u/${profile.handle}?tab=usage`}
            className={tabCls(activeTab === "usage")}
          >
            {t(locale, "prof.usage")}
          </Link>
        )}
      </div>

      {/* 帖子页签 */}
      {activeTab === "posts" &&
        (posts.length === 0 ? (
          <p className="mt-16 text-center text-sm text-grey">
            {t(locale, "prof.noPosts")}
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {posts.map((p) => (
              <article
                key={p.id}
                className="border border-line bg-card p-4 transition-colors hover:border-paper/20"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] text-grey">
                  <span>{relTime(p.createdAt, locale)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 tracking-wider">
                    {p.visibility === "private" && (
                      <span className="border border-line px-1 py-px text-[10px] text-paper">
                        {t(locale, "post.private")}
                      </span>
                    )}
                    {categoryLabel(locale, p.category)}
                  </span>
                </div>
                {p.title ? (
                  <>
                    <Link
                      href={`/community/${p.id}`}
                      className="mt-1 block text-[15px] font-medium leading-snug text-paper transition-colors hover:text-blue"
                    >
                      {p.title}
                      {p.type !== "text" && (
                        <span className="ml-2 border border-line px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal text-grey">
                          {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
                        </span>
                      )}
                    </Link>
                    {p.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
                        {p.excerpt}
                      </p>
                    )}
                  </>
                ) : (
                  <Link
                    href={`/community/${p.id}`}
                    className="mt-1 block text-[15px] leading-relaxed text-paper transition-colors hover:text-blue"
                  >
                    <span className="line-clamp-3">{p.excerpt}</span>
                    {p.type !== "text" && (
                      <span className="ml-2 border border-line px-1.5 py-0.5 align-middle font-mono text-[10px] text-grey">
                        {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
                      </span>
                    )}
                  </Link>
                )}
                <div className="mt-2.5 flex items-center gap-5 font-mono text-[11px] text-grey">
                  <span className="inline-flex items-center gap-1">
                    <ArrowBigUp size={14} />
                    {p.score}
                  </span>
                  <Link
                    href={`/community/${p.id}#comments`}
                    title={t(locale, "post.comments", { n: p.commentCount })}
                    className="inline-flex items-center gap-1 transition-colors hover:text-blue"
                  >
                    <MessageCircle size={13} />
                    {p.commentCount}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ))}

      {/* 评论页签 */}
      {activeTab === "comments" &&
        (comments.length === 0 ? (
          <p className="mt-16 text-center text-sm text-grey">
            {t(locale, "prof.noComments")}
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {comments.map((c) => (
              <article
                key={c.id}
                className="border border-line bg-card p-4 transition-colors hover:border-paper/20"
              >
                <div className="font-mono text-[11px] text-grey">
                  {t(locale, "prof.commentedOn")}{" "}
                  <Link
                    href={`/community/${c.postId}#comment-${c.id}`}
                    className="text-paper transition-colors hover:text-blue"
                  >
                    {c.postTitle}
                  </Link>
                  <span className="mx-2">·</span>
                  {relTime(c.createdAt, locale)}
                </div>
                <Link
                  href={`/community/${c.postId}#comment-${c.id}`}
                  className="mt-1.5 block text-sm leading-relaxed text-paper/90 transition-colors hover:text-blue"
                >
                  <span className="line-clamp-2">{c.excerpt}</span>
                </Link>
                <div className="mt-2 flex items-center gap-1 font-mono text-[11px] text-grey">
                  <ArrowBigUp size={13} />
                  {c.score}
                </div>
              </article>
            ))}
          </div>
        ))}

      {/* 作品页签:复用作品墙的 WorkCard;作品本来就公开,访客/本人同视图 */}
      {activeTab === "works" &&
        (works.length === 0 ? (
          <p className="mt-16 text-center text-sm text-grey">
            {t(locale, "prof.noWorks")}
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {works.map((w) => (
              <WorkCard
                key={w.id}
                work={w}
                locale={locale}
                meId={me?.id ?? null}
              />
            ))}
          </div>
        ))}

      {/* 用量页签:星期×小时的 token 热图(仅本人或对方自愿公开时才会走到这里) */}
      {activeTab === "usage" && heatmap && (
        <div className="mt-5 border border-line bg-card p-4">
          <SocialUsageHeatmap grid={heatmap} tzOffsetMinutes={tz} zh={locale === "zh"} />
        </div>
      )}
    </div>
  );
}
