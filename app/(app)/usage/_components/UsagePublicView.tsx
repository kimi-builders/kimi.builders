/* 未登录访客的用量公开概览(20260821 评审):用量榜是本站最有特色的公开
   橱窗,不该整体锁在登录后。本视图只消费 opt-in 聚合缓存
   (getPublicUsageLeaderboardPreview,与右栏预览/榜单页同一数据源),
   不查任何个人数据;登录后的完整个人 dashboard 在页面下游,保持不动。
   榜单为空 = 诚实空态:列表区显示空态文案,登录引导卡照常渲染。 */
import Link from "next/link";
import { BarChart3, ShieldCheck } from "lucide-react";
import Avatar from "@/components/Avatar";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { t, type Locale } from "@/src/lib/i18n";
import { getPublicUsageLeaderboardPreview } from "@/src/lib/usage/public-leaderboard-cache";

/* 与用量中心/右栏预览同一套 B/M/k 紧凑格式。 */
function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

export default async function UsagePublicView({
  locale,
}: {
  locale: Locale;
}) {
  const zh = locale === "zh";
  const entries = (await getPublicUsageLeaderboardPreview()).slice(0, 10);

  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-paper">
        <BarChart3 size={20} aria-hidden="true" />{" "}
        {zh ? "用量中心" : "Usage center"}
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-grey">
        {t(locale, "usage.publicLede")}
      </p>
      <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-grey">
        <ShieldCheck size={13} className="text-status-ok-fg" aria-hidden="true" />
        {zh ? "默认私有 · 榜单 opt-in" : "Private by default · opt-in leaderboard"}
      </p>

      <section className="mt-8">
        <div className="flex items-baseline justify-between border-b border-line pb-2">
          <h2 className="kb-eyebrow">{t(locale, "usage.publicBoard")}</h2>
          <Link
            href="/usage/leaderboard"
            className="text-xs text-ui-blue transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "usage.publicFull")}
          </Link>
        </div>
        {entries.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-grey">
            {t(locale, "usage.publicEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.userId} className="flex items-center gap-3 py-3">
                <span
                  className={`w-6 shrink-0 font-mono text-sm font-bold ${
                    e.rank === 1 ? "text-blue" : "text-grey/70"
                  }`}
                >
                  {String(e.rank).padStart(2, "0")}
                </span>
                <Link href={`/u/${e.handle}`} className="shrink-0">
                  <Avatar url={e.avatarUrl} handle={e.handle} size={28} />
                </Link>
                <Link
                  href={`/u/${e.handle}`}
                  className="min-w-0 flex-1 truncate text-sm text-paper transition-colors hover:text-ui-blue"
                >
                  {e.name || e.handle}
                </Link>
                <span className="hidden shrink-0 font-mono text-xs text-grey sm:inline">
                  {t(locale, "usage.publicDays", { n: e.activeDays })}
                </span>
                <span
                  className={`ml-auto shrink-0 font-mono text-sm font-semibold ${
                    e.rank === 1 ? "text-blue" : "text-paper"
                  }`}
                >
                  {compact(e.totalTokens)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10">
        <LoginGate locale={locale} title={t(locale, "usage.publicGate")} next="/usage" />
      </div>
    </div>
  );
}
