/* Demo Night /demo-night: online RSVP + archive. Browsing needs no
   login; RSVP does (re-authenticated inside the server action). Core
   semantics: the attendance list is public — signing up consents to
   your handle being credited on that event's list, ordered by signup
   time (first to arrive, first credited); attendance itself is scarce
   endorsement, not an ordinary stream. Without an upcoming event the
   current-event block reads "next one in preparation" while the
   archive stays. Visual: hard edges and hairlines, mono wide-tracked
   labels, no radii or shadows (avatars keep the site-wide circle). */
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
import { UPCOMING } from "@/src/lib/upcoming";
import SoonPanel from "../_components/SoonPanel";
import RsvpButton from "./_components/RsvpButton";

export const metadata: Metadata = { title: "Demo Night — kimi.builders" };

/* The current event's attendance: avatars + handles in a row, first
   to arrive first credited (already sorted by signup time
   server-side). */
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
            className="flex items-center gap-2 font-mono text-xs text-paper transition-colors hover:text-ui-blue"
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
  /* Section not ready (src/lib/upcoming.ts): the whole page shows the
     placeholder, no DB query. */
  if (UPCOMING.demoNight) {
    return <SoonPanel title={t(locale, "nav.demoNight")} locale={locale} />;
  }
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
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-paper">
          <Presentation size={18} aria-hidden="true" />
          {t(locale, "dn.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
          {t(locale, "dn.intro")}
        </p>
      </header>

      {/* ---- Current event ---- */}
      <section className="mt-4 rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h2 className="font-mono text-xs tracking-[0.08em] text-grey">
          {t(locale, "dn.upcoming")}
        </h2>
        {summary ? (
          <div className="mt-3">
            <h3 className="text-base font-semibold text-paper">
              {summary.event.title}
            </h3>
            <p className="mt-1.5 font-mono text-xs text-ui-blue">
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
                    className="ml-2 text-paper underline decoration-ui-blue/60 underline-offset-4 hover:text-ui-blue"
                  >
                    GitHub
                  </a>
                  <a
                    href="/api/auth/google"
                    className="ml-3 text-paper underline decoration-ui-blue/60 underline-offset-4 hover:text-ui-blue"
                  >
                    Google
                  </a>
                </p>
              )}
              <p className="text-xs text-grey/80">
                {t(locale, "dn.rsvpNotice")}
              </p>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="font-mono text-xs tracking-[0.08em] text-grey">
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

      {/* ---- Past events ---- */}
      <section className="mt-8">
        <h2 className="font-mono text-xs tracking-[0.08em] text-grey">
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
                    <p className="font-mono text-xs text-grey">
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
                      <summary className="cursor-pointer font-mono text-xs text-grey transition-colors hover:text-ui-blue">
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
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue"
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
