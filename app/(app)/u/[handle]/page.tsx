/* 个人主页 /u/[handle](Kimi Design 改造):身份 Hero(头像/统计带)+ 构建足迹
   (通栏 53 周贡献图)+ 动态 Tab 卡(帖子/评论/作品 + 用量/Agent/偏好)。
   本人视角多「编辑资料」入口,且能看到自己的私密帖(带标);访客只统计/展示公开内容。
   用量相关块(统计带/足迹/用量·Agent·偏好 tab)仅本人或对方自愿公开
   (usage_settings.show_on_leaderboard=1)时渲染,否则整块缺席(无负面标记)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import {
  ArrowBigUp,
  CalendarDays,
  MessageCircle,
  MessagesSquare,
  Package,
  PenLine,
} from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import Avatar from "@/components/Avatar";
import { TrackClick } from "@/app/(app)/_components/track";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { getPool } from "@/src/lib/db";
import { relTime } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getUserComments, getUserPosts } from "@/src/lib/posts";
import { getProfileByHandle, getProfileStats, profileDisplay } from "@/src/lib/users";
import { userWorksCountQuery } from "@/src/lib/share-posters";
import { USAGE_WEEKDAYS_EN, USAGE_WEEKDAYS_ZH } from "@/src/lib/usage/heatmap";
import { USAGE_DISPLAY_CURRENCIES } from "@/src/lib/usage/pricing";
import type { UsageTrendDay } from "@/src/lib/usage/query";
import { getUsageSettings } from "@/src/lib/usage/settings";
import { getUsageShareSnapshot, type UsageShareSnapshot } from "@/src/lib/usage/share";
import {
  getSocialDailyActivity,
  getSocialTopDimensions,
  getSocialUsageHeatmap,
  isUsagePublic,
  profileUsageQueryPlan,
} from "@/src/lib/usage/social";
import {
  buildYearGrid,
  footprintSummary,
  localTodayYmd,
} from "@/src/lib/usage/year-grid";
import { getUserWorks } from "@/src/lib/works";
import WorkCard from "../../works/_components/WorkCard";
import { UsageTrendChart } from "../../usage/_components/UsageVisualizations";
import ProfileShareButtons from "./_components/ProfileShareButtons";
import SocialUsageHeatmap from "./_components/SocialUsageHeatmap";
import YearFootprint from "./_components/YearFootprint";

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function durationText(seconds: number, zh: boolean): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return zh ? `${hours}时 ${minutes}分` : `${hours}h ${minutes}m`;
  return zh ? `${minutes} 分钟` : `${minutes}m`;
}

/* 与用量中心同一套 B/M/k 紧凑格式(同一数字两个页面读法一致)。 */
function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

/* 统计带分隔线:2/3/5 列响应式,与用量中心指标带同一套 nth-child 规则。 */
const STRIP_CELL =
  "border-line px-4 py-3 [&:nth-child(n+3)]:border-t sm:[&:nth-child(-n+3)]:border-t-0 sm:[&:nth-child(n+4)]:border-t lg:[&:nth-child(-n+5)]:border-t-0 lg:[&:not(:nth-child(5n+1))]:border-l";

const SITE_HOST = "kimi.builders";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const p = await getProfileByHandle(handle);
  if (!p) return { title: "kimi.builders" };
  /* 显示名对访客隐藏时,标签页标题/分享预览同样只落 @handle(本人视角不受限) */
  const me = await getSessionUser();
  const view = profileDisplay(p, me?.id === p.id);
  return { title: `${view.displayName} (@${p.handle}) — kimi.builders` };
}

/* Tab 空态:虚线图标 tile + 标题 + 说明 + CTA(CTA 仅本人)。
   访客视角的说明省略(标题本身就是「还没有…」,再放一句同义文案是重复)。 */
function EmptyPane({
  icon: Icon,
  title,
  text,
  ctaHref,
  ctaLabel,
}: {
  icon: typeof PenLine;
  title: string;
  text?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-dashed border-line bg-paper/[0.03] text-grey">
        <Icon size={20} aria-hidden="true" />
      </div>
      <h4 className="mt-4 max-w-sm text-sm leading-relaxed font-semibold text-paper">{title}</h4>
      {text && (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-grey">{text}</p>
      )}
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 font-mono text-[11px] text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
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
  const zh = locale === "zh";
  const profile = await getProfileByHandle(handle);

  if (!profile) {
    return (
      <p className="mt-16 text-center text-sm text-grey">
        {t(locale, "prof.notFound")}
      </p>
    );
  }

  const self = me?.id === profile.id;
  /* 资料字段级隐私(20260829):头像/显示名/简介的访客展示口径;本人视角不受限 */
  const view = profileDisplay(profile, self);
  /* 用量块门禁:本人恒可见;访客仅当对方 opt-in 公开。 */
  const usageVisible = self || (await isUsagePublic(profile.id));
  /* 用量/Agent/偏好三个 tab 同属隐私聚合,共用 usageVisible 门禁 */
  const activeTab =
    tab === "comments" || tab === "works"
      ? tab
      : usageVisible && (tab === "usage" || tab === "tools" || tab === "prefs")
        ? tab
        : "posts";
  const requestHeaders = await headers();
  trackEvent(
    "profile_view",
    { kind: "profile", id: profile.handle },
    { headers: requestHeaders },
  );
  trackEvent(
    "profile_tab_view",
    { kind: "profile", id: profile.handle },
    { headers: requestHeaders },
    { tab: activeTab },
  );
  const usageQueryPlan = profileUsageQueryPlan(activeTab, usageVisible);
  /* 分时热图/足迹的「本地」跟浏览器 kb_tz cookie(同用量看板);无 cookie 按 GMT+0 */
  const store = await cookies();
  const parsedTz = Number(store.get("kb_tz")?.value);
  const tz = Number.isFinite(parsedTz) ? parsedTz : 0;

  const ownerSettings = usageVisible ? await getUsageSettings(profile.id) : null;
  const worksCountQ = userWorksCountQuery(profile.id, self);
  const [stats, posts, comments, works, heatmap, daily, topDims, snapshotAll, worksCountRows] =
    await Promise.all([
      getProfileStats(profile.id, self),
      activeTab === "posts" ? getUserPosts(profile.id, self) : Promise.resolve([]),
      activeTab === "comments" ? getUserComments(profile.id, self) : Promise.resolve([]),
      activeTab === "works" ? getUserWorks(profile.id, self) : Promise.resolve([]),
      usageQueryPlan.heatmap
        ? getSocialUsageHeatmap(profile.id, tz)
        : Promise.resolve(null),
      usageVisible ? getSocialDailyActivity(profile.id, tz) : Promise.resolve(null),
      usageQueryPlan.topDimensions
        ? getSocialTopDimensions(profile.id)
        : Promise.resolve(null),
      usageVisible && ownerSettings
        ? getUsageShareSnapshot({
            user: profile,
            range: "all",
            tzOffsetMinutes: tz,
            uploadProject: ownerSettings.uploadProject,
            retentionDays: ownerSettings.retentionDays,
            /* 快照默认 zh(海报口径);主页按 UI 语言,否则 EN 界面会落出「未记录」 */
            zh,
          })
        : Promise.resolve(null),
      getPool().query(worksCountQ.sql, worksCountQ.args).then(([rows]) => rows),
    ]);
  /* 用量 tab 的「近 30 天」迷你面板只在激活时取数 */
  const snapshot30: UsageShareSnapshot | null =
    activeTab === "usage" && usageVisible && ownerSettings
      ? await getUsageShareSnapshot({
          user: profile,
          range: "30d",
          tzOffsetMinutes: tz,
          uploadProject: ownerSettings.uploadProject,
          retentionDays: ownerSettings.retentionDays,
          zh,
        })
      : null;

  const today = localTodayYmd(tz);
  const footprint = daily ? buildYearGrid(daily, today) : null;
  const fsum = daily ? footprintSummary(daily, today) : null;
  /* 用量 tab 的 30 天日序列:snapshot 的 stacked cells → UsageTrendDay
     (输入含缓存写 / 缓存读 / 输出含推理;请求/会话等维度日粒度没有,置 0)。 */
  const trend30: UsageTrendDay[] = snapshot30
    ? snapshot30.main.cells.map((c) => ({
        day: c.key,
        inputTokens: c.inputTokens ?? 0,
        cacheWriteInputTokens: 0,
        cacheReadInputTokens: c.cacheTokens ?? 0,
        outputTokens: c.outputTokens ?? 0,
        reasoningOutputTokens: 0,
        totalTokens: c.tokens,
        requests: 0,
        sessions: 0,
        activeSeconds: 0,
        costMicros: 0,
      }))
    : [];
  const worksCount = Number(
    (worksCountRows as { n?: number }[])[0]?.n ?? 0,
  );
  const weekdayNames = zh ? USAGE_WEEKDAYS_ZH : USAGE_WEEKDAYS_EN;
  const busiest = heatmap
    ? (heatmap
        .flatMap((row, weekday) => row.map((value, hour) => ({ weekday, hour, value })))
        .sort((a, b) => b.value - a.value)[0] ?? null)
    : null;
  const busiestSlot = busiest && busiest.value > 0 ? busiest : null;
  const profilePath = `/u/${profile.handle}`;
  const posterHref = `/api/share/u/${profile.handle}`;
  const usageStatsReady = usageVisible && snapshotAll !== null && fsum !== null;

  const tabs = [
    { key: "posts", label: t(locale, "prof.posts"), href: profilePath, count: stats.posts },
    {
      key: "comments",
      label: t(locale, "prof.comments"),
      href: `${profilePath}?tab=comments`,
      count: stats.comments,
    },
    {
      key: "works",
      label: t(locale, "prof.works"),
      href: `${profilePath}?tab=works`,
      count: worksCount,
    },
    ...(usageVisible
      ? [
          { key: "usage", label: t(locale, "prof.usage"), href: `${profilePath}?tab=usage`, count: null },
          { key: "tools", label: t(locale, "prof.tools"), href: `${profilePath}?tab=tools`, count: null },
          { key: "prefs", label: t(locale, "prof.prefs"), href: `${profilePath}?tab=prefs`, count: null },
        ]
      : []),
  ];

  return (
    <div>
      {/* ===== 身份 Hero：参考频道页，把身份、社交数字、简介与操作收拢在头像右侧 ===== */}
      <header className="usage-hero rounded-2xl border border-line p-5 sm:p-6">
        <div className="relative z-[1] flex items-start gap-4 sm:gap-6">
          <Avatar
            url={view.avatarUrl}
            handle={profile.handle}
            size={96}
            className="shrink-0 max-sm:!size-[72px]"
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="flex flex-wrap items-center gap-2.5 text-[22px] font-semibold tracking-[0.1px] text-paper sm:text-[26px]">
              {view.displayName}
              {profile.role !== "member" && (
                <span className="rounded-md border border-blue/50 bg-blue/10 px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-[0.16em] text-blue">
                  {profile.role.toUpperCase()}
                </span>
              )}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-grey sm:text-xs">
              <span className="font-semibold text-paper">@{profile.handle}</span>
              <span>{stats.posts} {t(locale, "prof.posts")}</span>
              <span>{stats.comments} {t(locale, "prof.comments")}</span>
              <span>{stats.likes} {t(locale, "prof.likes")}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-grey sm:text-[12px]">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={12} aria-hidden="true" />
                {t(locale, "prof.joined", { d: ymd(profile.createdAt) })}
              </span>
              <span className="font-mono text-[11px] text-blue">
                {SITE_HOST}{profilePath}
              </span>
            </div>
            {view.bio && (
              <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-paper/90">
                {view.bio}
              </p>
            )}
            <div className="mt-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:gap-2">
              <ProfileShareButtons
                path={profilePath}
                label={t(locale, "prof.share")}
                copiedLabel={t(locale, "post.copied")}
              />
              <TrackClick
                payload={{
                  event: "poster_download",
                  target_kind: "surface",
                  target_id: "profile",
                  meta: { surface: "profile" },
                }}
              >
                <a
                  href={`${posterHref}?download=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-line px-2.5 font-mono text-[11px] whitespace-nowrap text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-9 sm:gap-1.5 sm:px-3.5 sm:text-[11px]"
                >
                  {t(locale, "prof.poster")}
                </a>
              </TrackClick>
              {self && (
                <Link
                  href="/settings"
                  className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-blue bg-blue px-2.5 font-mono text-[11px] font-semibold whitespace-nowrap text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-9 sm:gap-1.5 sm:px-3.5 sm:text-[11px]"
                >
                  {t(locale, "prof.edit")}
                </Link>
              )}
            </div>
          </div>
        </div>
        {/* 统计带:opt-in 公开用量 → 5 格用量统计;否则回退社交三格 */}
        <div className="relative z-[1] mt-5 grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-5">
          {usageStatsReady ? (
            <>
              <div className={`${STRIP_CELL} lg:!pl-0`}>
                <div className="text-[11px] tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statTotal")}
                </div>
                <div className="mt-1.5 font-mono text-[25px] font-semibold leading-none tracking-[-0.5px] text-blue">
                  {compact(snapshotAll.lifetimeTokens)}
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-grey/70">
                  {t(locale, "prof.statTotalSub", {
                    v: `≈$${Math.round(snapshotAll.costMicros / 1e6).toLocaleString("en-US")}`,
                  })}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-[11px] tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statActiveDays")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {fsum.activeDays} <span className="text-[11px] font-medium text-grey">{zh ? "天" : "days"}</span>
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-grey/70">
                  {t(locale, "prof.statActiveDaysSub")}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-[11px] tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statStreak")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {fsum.streak.current} <span className="text-[11px] font-medium text-grey">{zh ? "天" : "days"}</span>
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-grey/70">
                  {t(locale, "prof.statStreakSub", {
                    n: snapshotAll.streakWeeks.current || snapshotAll.streakWeeks.longest,
                  })}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-[11px] tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statHitRate")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {snapshotAll.cacheHitRate === null
                    ? "—"
                    : `${(snapshotAll.cacheHitRate * 100).toFixed(1)}%`}
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-grey/70">
                  {t(locale, "prof.statHitRateSub", { v: compact(snapshotAll.flow.cacheReadTokens) })}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-[11px] tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statRequests")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {snapshotAll.requests.toLocaleString("en-US")}
                </div>
                <div className="mt-1 font-mono text-[10.5px] text-grey/70">
                  {t(locale, "prof.statRequestsSub", { n: snapshotAll.sessions.toLocaleString("en-US") })}
                </div>
              </div>
            </>
          ) : (
            <>
              {[
                { n: stats.posts, l: t(locale, "prof.posts") },
                { n: stats.comments, l: t(locale, "prof.comments") },
                { n: stats.likes, l: t(locale, "prof.likes") },
              ].map((s) => (
                <div key={s.l} className={STRIP_CELL}>
                  <div className="text-[11px] tracking-[0.05em] text-grey/80">{s.l}</div>
                  <div className="mt-1.5 font-mono text-lg font-semibold text-paper">{s.n}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </header>

      {/* ===== 主区:构建足迹(通栏)+ 动态 Tab 卡 ===== */}
      <div className="mt-4 flex flex-col gap-4">
          {/* 构建足迹(门禁同用量:仅本人或对方 opt-in) */}
          {footprint && fsum && (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-paper">
                  {t(locale, "prof.footprint")}
                </h2>
                <span className="font-mono text-[11px] text-grey/80">
                  {t(locale, "prof.footprintHint")}
                </span>
              </div>
              <div className="mt-3">
                <YearFootprint grid={footprint} summary={fsum} zh={zh} />
              </div>
            </section>
          )}

          {/* 动态 Tab 卡 */}
          <section className="overflow-hidden rounded-2xl border border-line bg-card">
            <nav
              className="scrollbar-none flex flex-nowrap gap-1 overflow-x-auto border-b border-line px-3 pt-2"
              aria-label={zh ? "主页分区" : "Profile sections"}
            >
              {tabs.map((item) => {
                const active = activeTab === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                      active
                        ? "border-blue text-paper"
                        : "border-transparent text-grey hover:text-paper"
                    }`}
                  >
                    {item.label}
                    {item.count !== null && (
                      <span
                        className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] ${
                          active
                            ? "border-blue/40 bg-blue/10 text-blue"
                            : "border-line bg-paper/[0.04] text-grey"
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* 帖子 */}
            {activeTab === "posts" &&
              (posts.length === 0 ? (
                <EmptyPane
                  icon={PenLine}
                  title={self ? t(locale, "prof.emptyPostsTitle") : t(locale, "prof.noPosts")}
                  ctaHref={self ? "/community/new" : undefined}
                  ctaLabel={self ? t(locale, "prof.emptyPostsCta") : undefined}
                />
              ) : (
                <div className="px-4 sm:px-5">
                  {posts.map((p) => (
                    <article key={p.id} className="border-b border-line py-4 last:border-b-0">
                      <div className="flex items-center gap-2 font-mono text-[11px] text-grey">
                        <span>{relTime(p.createdAt, locale)}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 tracking-wider">
                          {p.visibility === "private" && (
                            <span className="rounded-md border border-line px-1.5 py-px text-[11px] text-paper">
                              {t(locale, "post.private")}
                            </span>
                          )}
                          {p.hiddenAt && (
                            <span
                              className="rounded-md border border-red-400/60 px-1.5 py-px text-[11px] text-red-400"
                              title={p.hiddenReason ?? undefined}
                            >
                              {t(locale, "mod.hiddenBadge")}
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
                              <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 align-middle font-mono text-[11px] font-normal text-grey">
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
                            <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 align-middle font-mono text-[11px] text-grey">
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

            {/* 评论 */}
            {activeTab === "comments" &&
              (comments.length === 0 ? (
                <EmptyPane
                  icon={MessagesSquare}
                  title={self ? t(locale, "prof.emptyCommentsTitle") : t(locale, "prof.noComments")}
                  text={self ? t(locale, "prof.emptyCommentsText") : undefined}
                  ctaHref={self ? "/community" : undefined}
                  ctaLabel={self ? t(locale, "prof.emptyCommentsCta") : undefined}
                />
              ) : (
                <div className="px-4 sm:px-5">
                  {comments.map((c) => (
                    <article key={c.id} className="border-b border-line py-4 last:border-b-0">
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
                        {c.hidden && (
                          <span className="ml-2 rounded-md border border-red-400/60 px-1.5 py-px text-[11px] text-red-400">
                            {t(locale, "mod.hiddenBadge")}
                          </span>
                        )}
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

            {/* 作品:复用作品墙的 WorkCard;访客只见公开,本人含私密(卡片带「私密」标) */}
            {activeTab === "works" &&
              (works.length === 0 ? (
                <EmptyPane
                  icon={Package}
                  title={self ? t(locale, "prof.emptyWorksTitle") : t(locale, "prof.noWorks")}
                  text={self ? t(locale, "prof.emptyWorksText") : undefined}
                  ctaHref={self ? "/works/new" : undefined}
                  ctaLabel={self ? t(locale, "prof.emptyWorksCta") : undefined}
                />
              ) : (
                <div className="grid gap-4 p-4 sm:p-5">
                  {works.map((w) => (
                    <WorkCard key={w.id} work={w} locale={locale} meId={me?.id ?? null} />
                  ))}
                </div>
              ))}

            {/* 用量:近 30 天迷你面板 + 全部时间分时热图 */}
            {activeTab === "usage" && usageVisible && (
              <div className="p-4 sm:p-5">
                {snapshot30 && (
                  <div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-line bg-bg p-3.5">
                        <div className="text-[11px] text-grey/80">{t(locale, "prof.usage30")}</div>
                        <div className="mt-1.5 font-mono text-[17px] font-semibold text-paper">
                          {compact(snapshot30.totalTokens)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-line bg-bg p-3.5">
                        <div className="text-[11px] text-grey/80">{t(locale, "prof.usageHit")}</div>
                        <div className="mt-1.5 font-mono text-[17px] font-semibold text-paper">
                          {snapshot30.cacheHitRate === null
                            ? "—"
                            : `${(snapshot30.cacheHitRate * 100).toFixed(1)}%`}
                        </div>
                      </div>
                      <div className="rounded-xl border border-line bg-bg p-3.5">
                        <div className="text-[11px] text-grey/80">{t(locale, "prof.usageActive")}</div>
                        <div className="mt-1.5 font-mono text-[17px] font-semibold text-paper">
                          {durationText(snapshot30.activeSeconds, zh)}
                        </div>
                      </div>
                    </div>
                    {/* 近 30 天每日趋势:默认比较总量，构成信息在 Tooltip 中按需查看。 */}
                    <div className="mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-[13px] font-semibold text-paper">
                          {zh ? "近 30 天 Token 趋势" : "30-day token trend"}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1.5 text-[11px] text-grey">
                            <i className="h-2 w-2 rounded-[2px] bg-blue" />
                            {zh ? "总 Token" : "Total tokens"}
                          </span>
                          <span className="flex items-center gap-1.5 text-[11px] text-grey">
                            <i className="h-0 w-3.5 border-t-2 border-dashed border-grey/70" />
                            {zh ? "7 日均值" : "7-day average"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <UsageTrendChart
                          trend={trend30}
                          metric="tokens"
                          granularity="day"
                          rangeLabel="30d"
                          zh={zh}
                          currency={USAGE_DISPLAY_CURRENCIES.usd}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-grey">
                      <span>{t(locale, "prof.usageNote")}</span>
                      {self && (
                        <Link
                          href="/usage"
                          className="ml-auto font-semibold text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                        >
                          {t(locale, "prof.usageGo")}
                        </Link>
                      )}
                    </div>
                  </div>
                )}
                {heatmap && (
                  <div className={snapshot30 ? "mt-5 border-t border-line pt-4" : undefined}>
                    <p className="mb-3 font-mono text-[11px] text-grey/80">
                      {zh ? "星期 × 本地小时 · 全部时间" : "Weekday × local hour · all time"}
                    </p>
                    <SocialUsageHeatmap grid={heatmap} tzOffsetMinutes={tz} zh={zh} />
                  </div>
                )}
              </div>
            )}

            {/* 常用 Agent(门禁同用量 tab,用量中心分布卡的行式版本) */}
            {activeTab === "tools" && usageVisible && snapshotAll &&
              (snapshotAll.topTools.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-grey">
                  {t(locale, "prof.toolsEmpty")}
                </p>
              ) : (
                <ul className="px-4 sm:px-5">
                  {snapshotAll.topTools.map((tool, index) => {
                    const pct =
                      snapshotAll.lifetimeTokens > 0
                        ? (tool.tokens / snapshotAll.lifetimeTokens) * 100
                        : 0;
                    const topTokens = Math.max(1, snapshotAll.topTools[0]?.tokens ?? 1);
                    return (
                      <li key={tool.id} className="border-b border-line py-3 last:border-b-0">
                        <div className="flex items-center gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-xs text-paper">
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-line bg-paper/[0.04]">
                              <AgentIcon id={tool.id} size={12} />
                            </span>
                            <span className="truncate">{tool.label}</span>
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[11px] font-semibold text-paper">
                            {compact(tool.tokens)} · {Math.round(pct)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-paper/[0.06]">
                          <div
                            className={`h-full rounded-full ${
                              index === 0 ? "bg-gradient-to-r from-blue to-blue/40" : "bg-blue/70"
                            }`}
                            style={{ width: `${Math.max((tool.tokens / topTokens) * 100, 2)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ))}

            {/* 构建偏好(无数据的行自动省略,无负面标记) */}
            {activeTab === "prefs" && usageVisible && snapshotAll && (
              <dl className="divide-y divide-line px-4 sm:px-5">
                {busiestSlot && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefPeak")}</dt>
                    <dd className="font-mono text-[11.5px] text-paper">
                      {weekdayNames[busiestSlot.weekday]} {String(busiestSlot.hour).padStart(2, "0")}:00
                    </dd>
                  </div>
                )}
                {snapshotAll.topModel && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefModel")}</dt>
                    <dd className="max-w-[240px] truncate font-mono text-[11.5px] text-paper" title={snapshotAll.topModel}>
                      {snapshotAll.topModel}
                    </dd>
                  </div>
                )}
                {topDims?.topDevice && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefDevice")}</dt>
                    <dd className="max-w-[240px] truncate font-mono text-[11.5px] text-paper" title={topDims.topDevice}>
                      {topDims.topDevice}
                    </dd>
                  </div>
                )}
                {topDims?.topProject && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefProject")}</dt>
                    <dd className="max-w-[240px] truncate font-mono text-[11.5px] text-paper" title={topDims.topProject}>
                      {topDims.topProject}
                    </dd>
                  </div>
                )}
                {!busiestSlot && !snapshotAll.topModel && !topDims?.topDevice && !topDims?.topProject && (
                  <p className="py-10 text-center text-sm text-grey">
                    {t(locale, "prof.toolsEmpty")}
                  </p>
                )}
              </dl>
            )}
          </section>
      </div>
    </div>
  );
}
