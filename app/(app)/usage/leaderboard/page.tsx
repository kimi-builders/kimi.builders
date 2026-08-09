/* 社区用量榜(P1-1):公开页,浏览无需登录;未登录不显示任何额外信息(页面内容与登录态一致,
   只有布局壳的登录 chip 不同)。只展示主动 opt-in 成员的周期聚合(周期 token 总量 + 活跃天数),
   项目名、设备、时段等明细维度不进入查询,页面上也无从渲染。
   视觉遵守设计语言:硬边、细线、mono 大数字、无圆角无阴影(头像沿用全站圆形惯例);
   第一名以蓝色边线 + 加大 mono 数字强调。 */
import type { Metadata } from "next";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  getUsageLeaderboard,
  normalizeUsageLeaderboardPeriod,
  USAGE_LEADERBOARD_PERIODS,
  type UsageLeaderboardEntry,
} from "@/src/lib/usage/leaderboard";

export const metadata: Metadata = { title: "社区用量榜 — kimi.builders" };

/* 与 /usage 看板同款的紧凑数字:1.2k / 3.4M / 5.6B;精确值放 title。 */
function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

const GRID_COLS = "grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-3 px-4";

function LeaderboardRow({ entry, locale }: { entry: UsageLeaderboardEntry; locale: "zh" | "en" }) {
  const first = entry.rank === 1;
  return (
    <li
      className={`${GRID_COLS} py-3 ${
        first ? "border-b border-blue bg-blue/5" : "border-b border-line last:border-b-0"
      }`}
    >
      <span
        className={`text-right font-mono ${
          first ? "text-base font-semibold text-blue" : "text-sm text-grey"
        }`}
      >
        {entry.rank}
      </span>
      <span className="flex min-w-0 items-center gap-2.5">
        {entry.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={entry.avatarUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border border-paper/10"
          />
        ) : null}
        <span className="min-w-0">
          <Link
            href={`/u/${entry.handle}`}
            className="block truncate font-mono text-xs text-paper transition-colors hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            @{entry.handle}
          </Link>
          {entry.name ? (
            <span className="block truncate text-[11px] text-grey">{entry.name}</span>
          ) : null}
        </span>
      </span>
      <span
        className={`text-right font-mono text-paper ${first ? "text-lg font-semibold" : "text-sm"}`}
        title={entry.totalTokens.toLocaleString("en-US")}
      >
        {compact(entry.totalTokens)}
      </span>
      <span className="text-right font-mono text-[11px] text-grey">
        {t(locale, "lb.days", { n: entry.activeDays })}
      </span>
    </li>
  );
}

export default async function UsageLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const rawPeriod = Array.isArray(raw.period) ? raw.period[0] : raw.period;
  const period = normalizeUsageLeaderboardPeriod(rawPeriod);
  const user = await getSessionUser();
  const locale = await getLocale(user);

  let entries: UsageLeaderboardEntry[] | null = null;
  try {
    entries = await getUsageLeaderboard(period);
  } catch {
    entries = null;
  }

  return (
    <div>
      <header className="border-b border-line pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
              <Trophy size={18} aria-hidden="true" /> {t(locale, "lb.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
              {t(locale, "lb.intro")}
            </p>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-grey/80">
              {t(locale, "lb.trust")}
            </p>
          </div>
          <nav aria-label={t(locale, "lb.title")} className="flex shrink-0 items-center gap-1">
            {USAGE_LEADERBOARD_PERIODS.map((p) => (
              <Link
                key={p}
                href={`/usage/leaderboard?period=${p}`}
                scroll={false}
                aria-current={p === period ? "page" : undefined}
                className={`inline-flex min-h-11 items-center px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                  p === period ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
                }`}
              >
                {t(locale, p === "7d" ? "lb.period7" : "lb.period30")}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {entries === null ? (
        <p role="alert" className="mt-6 border border-line bg-card p-5 text-sm text-grey">
          {t(locale, "lb.loadError")}
        </p>
      ) : entries.length === 0 ? (
        <section className="mt-6 border border-line bg-card p-5">
          <p className="text-sm text-paper">{t(locale, "lb.empty")}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-grey">{t(locale, "lb.emptyHint")}</p>
          <Link
            href="/usage#usage-management"
            className="mt-4 inline-flex min-h-11 items-center border border-line px-4 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "lb.emptyCta")}
          </Link>
        </section>
      ) : (
        <section className="mt-6 border border-line bg-card">
          <div
            className={`${GRID_COLS} border-b border-line py-2.5 font-mono text-[10px] tracking-[0.14em] text-grey`}
          >
            <span className="text-right">{t(locale, "lb.colRank")}</span>
            <span>{t(locale, "lb.colMember")}</span>
            <span className="text-right">{t(locale, "lb.colTokens")}</span>
            <span className="text-right">{t(locale, "lb.colDays")}</span>
          </div>
          <ol>
            {entries.map((entry) => (
              <LeaderboardRow key={entry.handle} entry={entry} locale={locale} />
            ))}
          </ol>
        </section>
      )}

      <div className="mt-5 space-y-2 text-[11px] leading-relaxed text-grey/80">
        <p>{t(locale, "lb.scope")}</p>
        <p>{t(locale, "lb.trust")}</p>
      </div>
    </div>
  );
}
