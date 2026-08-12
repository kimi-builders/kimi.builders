/* Demo Night /demo-night:线上报名 + 归档页(实施计划第三步,P3 提前)。
   浏览无需登录;报名需登录(server action 内再兜底鉴权)。
   核心语义(战略支柱 1):到场名单公开 —— 报名即同意 handle 署进该场到场名单,
   名单按报名时间正序(先到场先署名),到场本身就是稀缺背书,不是普通直播。
   无 upcoming 场次时当前场区块显示「下一期筹备中」,归档照常。
   视觉:硬边细线、mono 大字距小标签、无圆角无阴影(头像沿用全站圆形惯例)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { MonitorPlay, Presentation } from "lucide-react";
import Avatar from "@/components/Avatar";
import Markdown from "@/components/Markdown";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  formatEventDate,
  formatEventTime,
  getArchivedEvents,
  getEventRoster,
  getEventRosters,
  getUpcomingSummary,
  type RosterEntry,
} from "@/src/lib/demo-night";
import { t, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RsvpButton from "./_components/RsvpButton";

export const metadata: Metadata = { title: "Demo Night — kimi.builders" };

/* 当前场到场名单:横排头像 + handle,先到场先署名(服务端已按报名时间排序)。 */
function RosterList({
  roster,
  locale,
}: {
  roster: RosterEntry[];
  locale: Locale;
}) {
  if (roster.length === 0) {
    return <p className="mt-3 text-xs text-grey">{t(locale, "dn.rosterEmpty")}</p>;
  }
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2.5">
      {roster.map((r) => (
        <li key={r.handle}>
          <Link
            href={`/u/${r.handle}`}
            className="flex items-center gap-2 font-mono text-xs text-paper transition-colors hover:text-blue"
          >
            <Avatar url={r.avatarUrl} handle={r.handle} size={24} />
            @{r.handle}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DemoNightPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const [summary, archive] = await Promise.all([
    getUpcomingSummary(user?.id ?? null),
    getArchivedEvents(20),
  ]);
  const [roster, archiveRosters] = await Promise.all([
    summary ? getEventRoster(summary.event.id) : [],
    getEventRosters(archive.map((e) => e.id)),
  ]);

  return (
    <div>
      <header className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h1 className="flex items-center gap-2 font-mono text-xl font-semibold">
          <Presentation size={18} aria-hidden="true" />
          {t(locale, "dn.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
          {t(locale, "dn.intro")}
        </p>
      </header>

      {/* ---- 当前场 ---- */}
      <section className="mt-4 rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 className="font-mono text-[10px] tracking-[0.25em] text-grey">
          {t(locale, "dn.upcoming")}
        </h2>
        {summary ? (
          <div className="mt-3">
            <h3 className="text-base font-semibold text-paper">
              {summary.event.title}
            </h3>
            <p className="mt-1.5 font-mono text-xs text-blue">
              {formatEventTime(summary.event.startsAt)}
            </p>
            {summary.event.locationNote && (
              <p className="mt-1 text-xs text-grey">
                {summary.event.locationNote}
              </p>
            )}
            {summary.event.description && (
              <div className="mt-3 text-sm leading-relaxed text-paper">
                <Markdown source={summary.event.description} />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {user ? (
                <RsvpButton
                  eventId={summary.event.id}
                  rsvped={summary.rsvped}
                  locale={locale}
                />
              ) : (
                  <p className="rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs text-grey">
                  {t(locale, "dn.loginToRsvp")}
                  <a
                    href="/api/auth/github"
                    className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
                  >
                    GitHub
                  </a>
                  <a
                    href="/api/auth/google"
                    className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
                  >
                    Google
                  </a>
                </p>
              )}
              <p className="text-[11px] text-grey/80">
                {t(locale, "dn.rsvpNotice")}
              </p>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="font-mono text-[10px] tracking-[0.25em] text-grey">
                {t(locale, "dn.roster")} ·{" "}
                {t(locale, "dn.rosterCount", { n: summary.rsvpCount })}
              </p>
              <RosterList roster={roster} locale={locale} />
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-line bg-bg/40 p-4 text-sm text-grey">{t(locale, "dn.nextPreparing")}</p>
        )}
      </section>

      {/* ---- 往期归档 ---- */}
      <section className="mt-8">
        <h2 className="font-mono text-[10px] tracking-[0.25em] text-grey">
          {t(locale, "dn.archive")}
        </h2>
        {archive.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-line bg-card p-6 text-sm text-grey">{t(locale, "dn.archiveEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {archive.map((ev) => {
              const evRoster = archiveRosters.get(ev.id) ?? [];
              return (
                <li key={ev.id} className="rounded-2xl border border-line bg-card p-5 transition-colors hover:border-paper/20">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-sm font-semibold text-paper">
                      {ev.title}
                    </h3>
                    <p className="font-mono text-[11px] text-grey">
                      {formatEventDate(ev.startsAt)} ·{" "}
                      {t(locale, "dn.archiveCount", { n: ev.rsvpCount })}
                    </p>
                  </div>
                  {ev.description && (
                    <div className="mt-2 text-sm leading-relaxed text-grey">
                      <Markdown source={ev.description} />
                    </div>
                  )}
                  {evRoster.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer font-mono text-[11px] text-grey transition-colors hover:text-blue">
                        {t(locale, "dn.rosterToggle", { n: evRoster.length })}
                      </summary>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {evRoster.map((r) => (
                          <Link
                            key={r.handle}
                            href={`/u/${r.handle}`}
                            title={`@${r.handle}`}
                          >
                            <Avatar url={r.avatarUrl} handle={r.handle} size={28} />
                          </Link>
                        ))}
                      </div>
                    </details>
                  )}
                  {ev.streamUrl && (
                    <a
                      href={ev.streamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 font-mono text-[11px] text-grey transition-colors hover:border-blue hover:text-blue"
                    >
                      <MonitorPlay size={13} aria-hidden="true" />
                      {t(locale, "dn.watchReplay")}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
