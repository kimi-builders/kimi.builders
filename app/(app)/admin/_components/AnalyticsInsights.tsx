import Link from "next/link";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import {
  EVENTS,
  getAnalyticsInsights,
  type AnalyticsCountRow,
  type AnalyticsEvent,
  type AnalyticsPeriod,
  type FeaturedClickRow,
} from "@/src/lib/analytics";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";

const EVENT_LABELS: Record<AnalyticsEvent, I18nKey> = {
  home_view: "analytics.eventHomeView",
  leaderboard_view: "analytics.eventLeaderboardView",
  awesome_view: "analytics.eventAwesomeView",
  works_view: "analytics.eventWorksView",
  usage_view: "analytics.eventUsageView",
  post_view: "analytics.eventPostView",
  work_view: "analytics.eventWorkView",
  profile_view: "analytics.eventProfileView",
  profile_tab_view: "analytics.eventProfileTabView",
  featured_click: "analytics.eventFeaturedClick",
  poster_download: "analytics.eventPosterDownload",
  join_click: "analytics.eventJoinClick",
};

const VIEW_EVENTS = EVENTS.filter((event) => event.endsWith("_view"));
const FEATURED_POSITIONS = ["home", "rail"] as const;
const POSTER_SURFACES = ["profile", "post", "work", "usage"] as const;

function numberText(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

function relativeWidth(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "0%";
  return `${Math.max((value / max) * 100, 2)}%`;
}

function MetricBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="mt-1.5 block h-1 rounded-full bg-paper/[0.06]" aria-hidden="true">
      <span
        className="block h-full rounded-full bg-gradient-to-r from-blue to-blue/40"
        style={{ width: relativeWidth(value, max) }}
      />
    </span>
  );
}

function fillRows(
  keys: readonly string[],
  rows: AnalyticsCountRow[],
): AnalyticsCountRow[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return keys.map(
    (key) => byKey.get(key) ?? { key, total: 0, uniqueViewers: 0 },
  );
}

function CountTable({
  rows,
  labelHeader,
  labelOf,
  caption,
  locale,
}: {
  rows: AnalyticsCountRow[];
  labelHeader: string;
  labelOf: (row: AnalyticsCountRow) => string;
  caption: string;
  locale: Locale;
}) {
  const max = Math.max(0, ...rows.map((row) => row.total));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] table-fixed border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-paper/[0.02] font-mono text-[10px] tracking-[0.1em] text-grey">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium sm:px-5">
              {labelHeader}
            </th>
            <th scope="col" className="w-20 px-2 py-2.5 text-right font-medium">
              {t(locale, "analytics.colTotal")}
            </th>
            <th scope="col" className="w-28 px-4 py-2.5 text-right font-medium sm:px-5">
              {t(locale, "analytics.colVisitorDays")}
            </th>
          </tr>
        </thead>
        <tbody className="font-mono text-[11px]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-5 text-center text-grey sm:px-5">
                {t(locale, "analytics.empty")}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const label = labelOf(row);
              return (
                <tr
                  key={row.key}
                  className="border-t border-line transition-colors first:border-t-0 hover:bg-paper/[0.03]"
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal sm:px-5">
                    <span className="block truncate text-paper" title={label}>
                      {label}
                    </span>
                    <MetricBar value={row.total} max={max} />
                  </th>
                  <td className="px-2 py-3 text-right font-semibold text-paper">
                    {numberText(row.total, locale)}
                  </td>
                  <td className="px-4 py-3 text-right text-grey sm:px-5">
                    {numberText(row.uniqueViewers, locale)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function CountPanel({
  id,
  title,
  note,
  rows,
  labelHeader,
  labelOf,
  locale,
}: {
  id: string;
  title: string;
  note: string;
  rows: AnalyticsCountRow[];
  labelHeader: string;
  labelOf: (row: AnalyticsCountRow) => string;
  locale: Locale;
}) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card"
    >
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <h2 id={id} className="text-[13px] font-semibold text-paper">
          {title}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-grey">{note}</p>
      </div>
      <CountTable
        rows={rows}
        labelHeader={labelHeader}
        labelOf={labelOf}
        caption={title}
        locale={locale}
      />
    </section>
  );
}

function featuredPositionLabel(
  position: (typeof FEATURED_POSITIONS)[number],
  locale: Locale,
): string {
  return t(
    locale,
    position === "home" ? "analytics.positionHome" : "analytics.positionRail",
  );
}

function featuredTargetLabel(row: FeaturedClickRow, locale: Locale): string {
  const kind = t(
    locale,
    row.targetKind === "work" ? "analytics.targetWork" : "analytics.targetPost",
  );
  return `${kind} #${row.targetId}`;
}

function FeaturedTable({
  rows,
  locale,
}: {
  rows: FeaturedClickRow[];
  locale: Locale;
}) {
  const max = Math.max(0, ...rows.map((row) => row.total));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] table-fixed border-collapse">
        <caption className="sr-only">{t(locale, "analytics.featuredTitle")}</caption>
        <thead className="border-b border-line bg-paper/[0.02] font-mono text-[10px] tracking-[0.1em] text-grey">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium sm:px-5">
              {t(locale, "analytics.colTarget")}
            </th>
            <th scope="col" className="w-20 px-2 py-2.5 text-right font-medium">
              {t(locale, "analytics.colTotal")}
            </th>
            <th scope="col" className="w-28 px-4 py-2.5 text-right font-medium sm:px-5">
              {t(locale, "analytics.colVisitorDays")}
            </th>
          </tr>
        </thead>
        {FEATURED_POSITIONS.map((position) => {
          const positionRows = rows.filter((row) => row.position === position);
          const positionTotal = positionRows.reduce((sum, row) => sum + row.total, 0);
          return (
            <tbody key={position} className="font-mono text-[11px]">
              <tr className="border-t border-line bg-paper/[0.015]">
                <th
                  scope="rowgroup"
                  colSpan={3}
                  className="px-4 py-2.5 text-left font-medium text-paper sm:px-5"
                >
                  <span>{featuredPositionLabel(position, locale)}</span>
                  <span className="ml-2 text-[10px] font-normal text-grey">
                    {t(locale, "analytics.groupClicks", {
                      n: numberText(positionTotal, locale),
                    })}
                  </span>
                </th>
              </tr>
              {positionRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-grey sm:px-5">
                    {t(locale, "analytics.empty")}
                  </td>
                </tr>
              ) : (
                positionRows.map((row) => {
                  const label = featuredTargetLabel(row, locale);
                  return (
                    <tr
                      key={`${position}-${row.targetKind}-${row.targetId}`}
                      className="border-t border-line transition-colors hover:bg-paper/[0.03]"
                    >
                      <th scope="row" className="px-4 py-3 text-left font-normal sm:px-5">
                        <span className="block truncate text-paper" title={label}>
                          {label}
                        </span>
                        <MetricBar value={row.total} max={max} />
                      </th>
                      <td className="px-2 py-3 text-right font-semibold text-paper">
                        {numberText(row.total, locale)}
                      </td>
                      <td className="px-4 py-3 text-right text-grey sm:px-5">
                        {numberText(row.uniqueViewers, locale)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export default async function AnalyticsInsights({
  locale,
  period,
}: {
  locale: Locale;
  period: AnalyticsPeriod;
}) {
  const insights = await getAnalyticsInsights(period);
  const eventRows = fillRows(EVENTS, insights.eventTotals);
  const posterRows = fillRows(POSTER_SURFACES, insights.posterDownloads);
  const pageRows = fillRows(VIEW_EVENTS, insights.pageViews);

  const posterLabel = (row: AnalyticsCountRow): string => {
    const keys: Record<string, I18nKey> = {
      profile: "analytics.surfaceProfile",
      post: "analytics.surfacePost",
      work: "analytics.surfaceWork",
      usage: "analytics.surfaceUsage",
    };
    return t(locale, keys[row.key] ?? "analytics.surfaceProfile");
  };

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-paper">
              {t(locale, "analytics.overviewTitle")}
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-grey">
              {t(locale, "analytics.overviewNote")}
            </p>
          </div>
          <nav aria-label={t(locale, "analytics.periodLabel")} className={SEG_WRAP}>
            {(["7d", "30d"] as const).map((item) => (
              <Link
                key={item}
                href={`/admin?tab=insights&period=${item}`}
                scroll={false}
                aria-current={period === item ? "page" : undefined}
                className={`${SEG_ITEM} ${period === item ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                {t(
                  locale,
                  item === "7d" ? "analytics.period7" : "analytics.period30",
                )}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-3 rounded-xl border border-line bg-bg/40 p-3 text-[11px] leading-relaxed text-grey">
          {t(locale, "analytics.privacyNote")}
          <span className="mt-1 block text-grey/80">
            {t(locale, "analytics.visitorDaysNote")}
          </span>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {eventRows.map((row) => (
            <article key={row.key} className="rounded-xl border border-line bg-bg/40 p-3.5">
              <h3
                className="truncate text-xs text-paper"
                title={t(locale, EVENT_LABELS[row.key as AnalyticsEvent])}
              >
                {t(locale, EVENT_LABELS[row.key as AnalyticsEvent])}
              </h3>
              <p className="mt-3 font-mono text-2xl font-semibold leading-none text-paper">
                {numberText(row.total, locale)}
              </p>
              <p className="mt-1 font-mono text-[9px] tracking-[0.08em] text-grey/80">
                {t(locale, "analytics.eventTotal")}
              </p>
              <p className="mt-2 font-mono text-[10px] text-grey">
                {t(locale, "analytics.visitorDaysValue", {
                  n: numberText(row.uniqueViewers, locale),
                })}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section
          aria-labelledby="analytics-featured-title"
          className="min-w-0 overflow-hidden rounded-2xl border border-line bg-card"
        >
          <div className="border-b border-line px-4 py-3.5 sm:px-5">
            <h2
              id="analytics-featured-title"
              className="text-[13px] font-semibold text-paper"
            >
              {t(locale, "analytics.featuredTitle")}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-grey">
              {t(locale, "analytics.featuredNote")}
            </p>
          </div>
          <FeaturedTable rows={insights.featuredClicks} locale={locale} />
        </section>

        <CountPanel
          id="analytics-poster-title"
          title={t(locale, "analytics.posterTitle")}
          note={t(locale, "analytics.posterNote")}
          rows={posterRows}
          labelHeader={t(locale, "analytics.colSurface")}
          labelOf={posterLabel}
          locale={locale}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CountPanel
          id="analytics-works-title"
          title={t(locale, "analytics.topWorksTitle")}
          note={t(locale, "analytics.topTargetsNote")}
          rows={insights.topWorks}
          labelHeader={t(locale, "analytics.colWork")}
          labelOf={(row) => `#${row.key}`}
          locale={locale}
        />
        <CountPanel
          id="analytics-profiles-title"
          title={t(locale, "analytics.topProfilesTitle")}
          note={t(locale, "analytics.topTargetsNote")}
          rows={insights.topProfiles}
          labelHeader={t(locale, "analytics.colProfile")}
          labelOf={(row) => `@${row.key}`}
          locale={locale}
        />
      </div>

      <CountPanel
        id="analytics-page-views-title"
        title={t(locale, "analytics.pageViewsTitle")}
        note={t(locale, "analytics.pageViewsNote")}
        rows={pageRows}
        labelHeader={t(locale, "analytics.colPage")}
        labelOf={(row) => t(locale, EVENT_LABELS[row.key as AnalyticsEvent])}
        locale={locale}
      />
    </div>
  );
}
