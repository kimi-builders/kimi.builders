/* The signed-out public usage overview: the leaderboard is the site's
   most distinctive public showcase and shouldn't sit entirely behind
   login. This view consumes only the opt-in aggregate cache
   (getPublicUsageLeaderboardPreview — the same source as the rail
   preview and the board page) and queries no personal data; the full
   signed-in personal dashboard stays downstream, untouched. Above the
   board sits the "personal dashboard preview" (UsagePreviewStrip) —
   deterministic sample data rendering the real panel components, so
   visitors see what they'd get before logging in. An empty board is
   an honest empty state: empty-copy in the list area, login card as
   usual. */
import Link from "next/link";
import { BarChart3, ShieldCheck } from "lucide-react";
import Avatar from "@/components/Avatar";
import LoginGate from "@/app/(app)/_components/LoginGate";
import { t, type Locale } from "@/src/lib/i18n";
import { getPublicUsageLeaderboardPreview } from "@/src/lib/usage/public-leaderboard-cache";
import UsagePreviewStrip from "./UsagePreviewStrip";

/* The same compact B/M/k format as the usage center and rail
   preview. */
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
        <p className="flex items-center gap-1.5 text-grey">
          <ShieldCheck size={13} className="text-status-ok-fg" aria-hidden="true" />
          {zh ? "默认私有 · 榜单 opt-in" : "Private by default · opt-in leaderboard"}
        </p>
        <Link
          href="/login?next=%2Fusage"
          className="inline-flex min-h-11 items-center text-ui-blue underline decoration-ui-blue/50 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "usage.publicLogin")} →
        </Link>
      </div>

      {/* Personal-panel preview (live-rendered sample data): show what you get first, the public board follows below */}
      <UsagePreviewStrip locale={locale} />

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
