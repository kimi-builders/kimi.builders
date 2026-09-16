/* Profile page /u/[handle]: identity hero (avatar/stats band) + the
   build footprint (a full-width 53-week contribution graph) + dynamic
   tab cards (posts/comments/works + usage/agent/preferences). The
   owner's view adds an "edit profile" entry and shows their private
   posts (labeled); visitors count and display public content only.
   Usage blocks (stats band/footprint/usage-agent-preferences tabs)
   render only for the owner or when the user opted in
   (usage_settings.show_on_leaderboard=1) — otherwise the whole block
   is absent (no negative signaling). */
import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  ArrowBigUp,
  CalendarDays,
  MessageCircle,
  MessagesSquare,
  Package,
  PenLine,
} from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import { ChartHeader, MetricCard } from "@/components/data-display";
import UsageInsightPanel from "@/components/UsageInsightPanel";
import Avatar from "@/components/Avatar";
import { TrackClick } from "@/app/(app)/_components/track";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { categoryLabel } from "@/src/lib/categories";
import { plainExcerpt, relTime } from "@/src/lib/format";
import { formatApproxUsdMicros } from "@/src/lib/data-display";
import { buildUsageInsights } from "@/src/lib/usage/insights";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { detailMetadata } from "@/src/lib/page-metadata";
import { getUserComments, getUserPosts } from "@/src/lib/posts";
import { getProfileByHandle, getProfileStats, profileDisplay } from "@/src/lib/users";
import { getUserWorksCount } from "@/src/lib/share-posters";
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

/* The same compact B/M/k format as the usage center (one number reads
   the same on both pages). */
function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

/* Stats band separators: 2/3/5 responsive columns, the same nth-child
   rules as the usage center's metric band. */
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
  /* Metadata is always the public profile view, including for the owner,
     so a copied preview cannot disclose a hidden name or bio. */
  const view = profileDisplay(p, false);
  const locale = await getLocale();
  const identity =
    view.displayName === `@${p.handle}`
      ? view.displayName
      : `${view.displayName} (@${p.handle})`;
  return detailMetadata({
    title: `${identity} — kimi.builders`,
    description:
      plainExcerpt(view.bio, 160) ||
      (locale === "zh" ? `@${p.handle} 的公开成员主页。` : `Public member profile for @${p.handle}.`),
    path: `/u/${p.handle}`,
    locale,
    image: `/api/share/u/${p.handle}?locale=${locale}`,
  });
}

/* Tab empty state: a dashed icon tile + title + description + CTA (the
   CTA is owner-only). The visitor view omits the description (the
   title already says "nothing yet..."; a synonymous line would
   repeat it). */
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
          className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 font-mono text-xs text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
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

  if (!profile) notFound();

  const self = me?.id === profile.id;
  /* Per-field profile privacy: the visitor-facing display rules for
     avatar/display name/bio; the owner's own view is unrestricted. */
  const view = profileDisplay(profile, self);
  /* Usage-block gate: always visible to the owner; visitors only when
     the user opted in. */
  const usageVisible = self || (await isUsagePublic(profile.id));
  /* The usage/agent/preferences tabs are all private aggregates and
     share the usageVisible gate. */
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
  /* The heatmap/footprint's "local" follows the browser's kb_tz cookie
     (like the usage dashboard); without it, GMT+0. */
  const store = await cookies();
  const parsedTz = Number(store.get("kb_tz")?.value);
  const tz = Number.isFinite(parsedTz) ? parsedTz : 0;

  const ownerSettings = usageVisible ? await getUsageSettings(profile.id) : null;
  const [stats, posts, comments, works, heatmap, daily, topDims, snapshotAll, worksCount] =
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
            /* The snapshot defaults to zh (poster convention); the page
               follows the UI locale — an EN interface would otherwise read
               "not recorded". */
            zh,
          })
        : Promise.resolve(null),
      getUserWorksCount(profile.id, self),
    ]);
  /* The usage tab's "last 30 days" mini panel fetches only when
     active. */
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
  /* The usage tab's 30-day series: the snapshot's stacked cells ->
     UsageTrendDay (input incl. cache write / cache read / output incl.
     reasoning; request/session dimensions have no daily grain, zero). */
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
  const weekdayNames = zh ? USAGE_WEEKDAYS_ZH : USAGE_WEEKDAYS_EN;
  const busiest = heatmap
    ? (heatmap
        .flatMap((row, weekday) => row.map((value, hour) => ({ weekday, hour, value })))
        .sort((a, b) => b.value - a.value)[0] ?? null)
    : null;
  const busiestSlot = busiest && busiest.value > 0 ? busiest : null;
  const profilePath = `/u/${profile.handle}`;
  const posterHref = `/api/share/u/${profile.handle}?locale=${locale}`;
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
      {/* ===== Identity hero, channel-page style: name, social counts, bio, and actions gathered right of the avatar ===== */}
      <header className="usage-hero rounded-2xl border border-line p-5 sm:p-6">
        <div className="relative z-[1] grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-x-6">
          <Avatar
            url={view.avatarUrl}
            handle={profile.handle}
            size={96}
            className="shrink-0 max-sm:!size-[72px]"
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-semibold text-paper sm:text-3xl">
              {view.displayName}
              {profile.role !== "member" && (
                <span className="rounded-md border border-blue/50 bg-blue/10 px-2 py-0.5 font-mono text-xs font-bold tracking-[0.08em] text-blue">
                  {profile.role.toUpperCase()}
                </span>
              )}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-grey sm:text-xs">
              <span className="font-semibold text-paper">@{profile.handle}</span>
              <span>{stats.posts} {t(locale, "prof.posts")}</span>
              <span>{stats.comments} {t(locale, "prof.comments")}</span>
              <span>{stats.likes} {t(locale, "prof.likes")}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-grey sm:text-xs">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={12} aria-hidden="true" />
                {t(locale, "prof.joined", { d: ymd(profile.createdAt) })}
              </span>
              <span className="font-mono text-xs text-ui-blue">
                {SITE_HOST}{profilePath}
              </span>
            </div>
          </div>
          {view.bio && (
            <p className="col-span-2 mt-4 whitespace-pre-wrap text-sm leading-relaxed text-paper/90 sm:col-span-1 sm:col-start-2 sm:mt-2.5">
              {view.bio}
            </p>
          )}
          <div
            className={`col-span-2 mt-4 grid items-stretch gap-2 sm:col-span-1 sm:col-start-2 sm:mt-3 sm:flex sm:flex-wrap ${
              self ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
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
                href={`${posterHref}&download=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1 rounded-lg border border-line px-2 text-xs whitespace-nowrap text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto sm:gap-1.5 sm:px-3.5"
              >
                {t(locale, "prof.poster")}
              </a>
            </TrackClick>
            {self && (
              <Link
                href="/settings"
                className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1 rounded-lg border border-blue bg-blue px-2 text-xs font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto sm:gap-1.5 sm:px-3.5"
              >
                {t(locale, "prof.edit")}
              </Link>
            )}
          </div>
        </div>
        {/* Stats band: opted-in public usage -> 5 usage cells; otherwise falls back to the 3 social cells */}
        <div className="relative z-[1] mt-5 grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-5">
          {usageStatsReady ? (
            <>
              <div className={`${STRIP_CELL} lg:!pl-0`}>
                <div className="text-xs tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statTotal")}
                </div>
                <div className="mt-1.5 font-mono text-2xl font-semibold leading-none tracking-[-0.5px] text-ui-blue">
                  {compact(snapshotAll.lifetimeTokens)}
                </div>
                <div className="mt-1 font-mono text-xs text-grey/70">
                  {t(locale, "prof.statTotalSub", {
                    v: formatApproxUsdMicros(snapshotAll.costMicros),
                  })}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-xs tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statActiveDays")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {fsum.activeDays} <span className="text-xs font-medium text-grey">{zh ? "天" : "days"}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-grey/70">
                  {t(locale, "prof.statActiveDaysSub")}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-xs tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statStreak")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {fsum.streak.current} <span className="text-xs font-medium text-grey">{zh ? "天" : "days"}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-grey/70">
                  {/* Same time scale as the main value: the longest
                      daily streak, not the weekly streak (the weekly
                      fallback read as "0 days yet 21 weeks"). */}
                  {t(locale, "prof.statStreakSub", { n: fsum.streak.longest })}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-xs tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statHitRate")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {snapshotAll.cacheHitRate === null
                    ? "—"
                    : `${(snapshotAll.cacheHitRate * 100).toFixed(1)}%`}
                </div>
                <div className="mt-1 font-mono text-xs text-grey/70">
                  {t(locale, "prof.statHitRateSub", { v: compact(snapshotAll.flow.cacheReadTokens) })}
                </div>
              </div>
              <div className={STRIP_CELL}>
                <div className="text-xs tracking-[0.05em] text-grey/80">
                  {t(locale, "prof.statRequests")}
                </div>
                <div className="mt-1.5 font-mono text-lg font-semibold text-paper">
                  {snapshotAll.requests.toLocaleString("en-US")}
                </div>
                <div className="mt-1 font-mono text-xs text-grey/70">
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
                  <div className="text-xs tracking-[0.05em] text-grey/80">{s.l}</div>
                  <div className="mt-1.5 font-mono text-lg font-semibold text-paper">{s.n}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </header>

      {/* ===== Main area: usage history (full-width) + activity tab card ===== */}
      <div className="mt-4 flex flex-col gap-4">
          {/* Usage history (same gate as usage: self only, or the owner opted in) */}
          {footprint && fsum && (
            <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-paper">
                  {t(locale, "prof.footprint")}
                </h2>
                <span className="font-mono text-xs text-grey/80">
                  {t(locale, "prof.footprintHint")}
                </span>
              </div>
              <div className="mt-3">
                <YearFootprint grid={footprint} summary={fsum} zh={zh} />
              </div>
            </section>
          )}

          {/* Activity tab card */}
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
                    className={`kb-navlink -mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                      active
                        ? "border-blue text-paper"
                        : "border-transparent text-grey hover:text-paper"
                    }`}
                  >
                    {item.label}
                    {item.count !== null && (
                      <span
                        className={`rounded-full border px-1.5 py-0.5 font-mono text-xs ${
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

            {/* Posts */}
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
                      <div className="flex items-center gap-2 font-mono text-xs text-grey">
                        <span>{relTime(p.createdAt, locale)}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 tracking-wider">
                          {p.visibility === "private" && (
                            <span className="rounded-md border border-line px-1.5 py-px text-xs text-paper">
                              {t(locale, "post.private")}
                            </span>
                          )}
                          {p.hiddenAt && (
                            <span
                              className="rounded-md border border-status-danger/60 px-1.5 py-px text-xs text-status-danger-fg"
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
                            className="mt-1 block text-sm font-medium leading-snug text-paper transition-colors hover:text-ui-blue"
                          >
                            {p.title}
                            {p.type !== "text" && (
                              <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 align-middle font-mono text-xs font-normal text-grey">
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
                          className="mt-1 block text-sm leading-relaxed text-paper transition-colors hover:text-ui-blue"
                        >
                          <span className="line-clamp-3">{p.excerpt}</span>
                          {p.type !== "text" && (
                            <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 align-middle font-mono text-xs text-grey">
                              {t(locale, p.type === "link" ? "post.typeLink" : "post.typePoll")}
                            </span>
                          )}
                        </Link>
                      )}
                      <div className="mt-2.5 flex items-center gap-5 font-mono text-xs text-grey">
                        <span className="inline-flex items-center gap-1">
                          <ArrowBigUp size={14} />
                          {p.score}
                        </span>
                        <Link
                          href={`/community/${p.id}#comments`}
                          title={t(locale, "post.comments", { n: p.commentCount })}
                          className="inline-flex items-center gap-1 transition-colors hover:text-ui-blue"
                        >
                          <MessageCircle size={13} />
                          {p.commentCount}
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ))}

            {/* Comments */}
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
                      <div className="font-mono text-xs text-grey">
                        {t(locale, "prof.commentedOn")}{" "}
                        <Link
                          href={`/community/${c.postId}#comment-${c.id}`}
                          className="text-paper transition-colors hover:text-ui-blue"
                        >
                          {c.postTitle}
                        </Link>
                        <span className="mx-2">·</span>
                        {relTime(c.createdAt, locale)}
                        {c.hidden && (
                          <span className="ml-2 rounded-md border border-status-danger/60 px-1.5 py-px text-xs text-status-danger-fg">
                            {t(locale, "mod.hiddenBadge")}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/community/${c.postId}#comment-${c.id}`}
                        className="mt-1.5 block text-sm leading-relaxed text-paper/90 transition-colors hover:text-ui-blue"
                      >
                        <span className="line-clamp-2">{c.excerpt}</span>
                      </Link>
                      <div className="mt-2 flex items-center gap-1 font-mono text-xs text-grey">
                        <ArrowBigUp size={13} />
                        {c.score}
                      </div>
                    </article>
                  ))}
                </div>
              ))}

            {/* Works: reuses the work wall's WorkCard; visitors see public only, the owner also sees private (card carries a "private" badge) */}
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

            {/* Usage: last-30-days mini panel + all-time hour-by-day heatmap */}
            {activeTab === "usage" && usageVisible && (
              <div className="p-4 sm:p-5">
                {snapshot30 && (
                  <div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricCard
                        label={t(locale, "prof.usage30")}
                        value={compact(snapshot30.totalTokens)}
                        accent
                        meta={[zh ? "近 30 天累计" : "30-day total"]}
                        className="p-3.5"
                      />
                      <MetricCard
                        label={t(locale, "prof.usageHit")}
                        value={snapshot30.cacheHitRate === null ? "—" : `${(snapshot30.cacheHitRate * 100).toFixed(1)}%`}
                        meta={[zh ? "近 30 天输入侧" : "30-day input side"]}
                        className="p-3.5"
                      />
                      <MetricCard
                        label={t(locale, "prof.usageActive")}
                        value={durationText(snapshot30.activeSeconds, zh)}
                        meta={[zh ? "近 30 天累计" : "30-day total"]}
                        className="p-3.5"
                      />
                    </div>
                    <UsageInsightPanel
                      className="mt-4"
                      insights={buildUsageInsights({
                        trend: trend30,
                        currentTokens: snapshot30.totalTokens,
                        cacheHitRate: snapshot30.cacheHitRate,
                        zh,
                      })}
                      zh={zh}
                    />
                    {/* Daily trend over the last 30 days: totals compared by default, composition available in the tooltip on demand. */}
                    <div className="mt-4">
                      <ChartHeader
                        headingLevel="h4"
                        title={zh ? "近 30 天 Token 趋势" : "30-day token trend"}
                        source={zh ? "来源：公开聚合快照" : "Source: public aggregate snapshot"}
                        meta={[zh ? "与用量中心同口径" : "Same basis as usage center"]}
                        actions={
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1.5 text-xs text-grey">
                            <i className="h-2 w-2 rounded-[2px] bg-viz-blue-primary" />
                            {zh ? "总 Token" : "Total tokens"}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-grey">
                            <i className="h-0 w-3.5 border-t-2 border-dashed border-grey/70" />
                            {zh ? "7 日均值" : "7-day average"}
                          </span>
                        </div>
                        }
                      />
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
                    <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-grey">
                      <span>{t(locale, "prof.usageNote")}</span>
                      {self && (
                        <Link
                          href="/usage"
                          className="ml-auto font-semibold text-ui-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                        >
                          {t(locale, "prof.usageGo")}
                        </Link>
                      )}
                    </div>
                  </div>
                )}
                {heatmap && (
                  <div className={snapshot30 ? "mt-5 border-t border-line pt-4" : undefined}>
                    <p className="mb-3 font-mono text-xs text-grey/80">
                      {zh ? "星期 × 本地小时 · 全部时间" : "Weekday × local hour · all time"}
                    </p>
                    <SocialUsageHeatmap grid={heatmap} tzOffsetMinutes={tz} zh={zh} />
                  </div>
                )}
              </div>
            )}

            {/* Top agents (same gate as the usage tab; row-style version of the usage hub's distribution card) */}
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
                            <AgentIcon id={tool.id} context="chart" />
                            <span className="truncate">{tool.label}</span>
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-xs font-semibold text-paper">
                            {compact(tool.tokens)} · {Math.round(pct)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-viz-grid">
                          <div
                            className={`h-full rounded-[2px] ${
                              index === 0 ? "bg-viz-blue-primary" : "bg-viz-neutral-muted"
                            }`}
                            style={{ width: `${Math.max((tool.tokens / topTokens) * 100, 2)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ))}

            {/* Usage breakdown (rows without data are omitted automatically; no negative labels) */}
            {activeTab === "prefs" && usageVisible && snapshotAll && (
              <dl className="divide-y divide-line px-4 sm:px-5">
                {busiestSlot && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefPeak")}</dt>
                    <dd className="font-mono text-xs text-paper">
                      {weekdayNames[busiestSlot.weekday]} {String(busiestSlot.hour).padStart(2, "0")}:00
                    </dd>
                  </div>
                )}
                {snapshotAll.topModel && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefModel")}</dt>
                    <dd className="max-w-[240px] truncate font-mono text-xs text-paper" title={snapshotAll.topModel}>
                      {snapshotAll.topModel}
                    </dd>
                  </div>
                )}
                {topDims?.topDevice && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefDevice")}</dt>
                    <dd className="max-w-[240px] truncate font-mono text-xs text-paper" title={topDims.topDevice}>
                      {topDims.topDevice}
                    </dd>
                  </div>
                )}
                {topDims?.topProject && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-xs text-grey">{t(locale, "prof.prefProject")}</dt>
                    <dd className="max-w-[240px] truncate font-mono text-xs text-paper" title={topDims.topProject}>
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
