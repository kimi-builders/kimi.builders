/* Community feed rail: about / usage leaderboard preview / editorial
   featuring / Demo Night / 7-day hot / community stats / new members —
   all real data. The "browse community" category navigation moved
   into the feed bar (sort seg + topic pills); the rail doesn't repeat
   it. Usage leaderboard preview: the 30d overall TOP4 + the current
   user's row (appended when outside the TOP4, blue-tinted); the opt-in
   gate lives in the board's SQL (private users are naturally absent
   from the result set). A cold-start empty board never renders. With
   zero featured items the widget never renders. Demo Night: no
   upcoming event means no widget; the RSVP state goes through
   getSessionUser (deduped with the shell by React cache, no extra
   query). */
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { TrackClick } from "@/app/(app)/_components/track";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";
import { getSessionUser } from "@/src/lib/auth/session";
import { formatEventTime, getUpcomingSummary } from "@/src/lib/demo-night";
import {
  getPublicCommunitySidebar,
  getPublicFeaturedRail,
} from "@/src/lib/public-rails-cache";
import { getPublicUsageLeaderboardPreview } from "@/src/lib/usage/public-leaderboard-cache";
import { t, type Locale } from "@/src/lib/i18n";
import Widget from "./Widget";

/* The same compact B/M/k format as the usage center. */
function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

export default async function CommunityWidgets({
  locale,
}: {
  locale: Locale;
}) {
  const user = await getSessionUser();
  const [data, featured, demoNight, lbEntries] = await Promise.all([
    getPublicCommunitySidebar(),
    getPublicFeaturedRail(),
    getUpcomingSummary(user?.id ?? null),
    getPublicUsageLeaderboardPreview(),
  ]);
  const lbTop = lbEntries.slice(0, 4);
  const lbMe =
    user && !lbTop.some((e) => e.userId === user.id)
      ? (lbEntries.find((e) => e.userId === user.id) ?? null)
      : null;
  return (
    <>
      <Widget title={t(locale, "side.about")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "side.aboutBody")}
        </p>
        <div className="mt-3 flex gap-4 text-xs">
          <a
            href="https://github.com/kimi-builders"
            className="text-grey underline decoration-ui-blue/50 underline-offset-4 hover:text-ui-blue"
          >
            GitHub
          </a>
          <a
            href="https://github.com/kimi-builders/awesome-kimi-builders"
            className="text-grey underline decoration-ui-blue/50 underline-offset-4 hover:text-ui-blue"
          >
            Awesome
          </a>
        </div>
      </Widget>

      {(lbTop.length > 0 || lbMe) && (
        <Widget
          title={t(locale, "side.lbPreview")}
          note={t(locale, "side.lbPreviewNote")}
          action={
            <Link
              href="/usage/leaderboard"
              className="text-xs text-ui-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {t(locale, "side.lbFull")}
            </Link>
          }
        >
          <ul>
            {lbTop.map((e) => (
              <li key={e.userId} className="flex items-center gap-2.5 border-b border-line py-2 last:border-b-0">
                <span
                  className={`w-4 shrink-0 font-mono text-xs font-bold ${
                    e.rank === 1 ? "text-blue" : "text-grey/70"
                  }`}
                >
                  {String(e.rank).padStart(2, "0")}
                </span>
                <Link href={`/u/${e.handle}`} className="shrink-0">
                  <Avatar url={e.avatarUrl} handle={e.handle} size={24} />
                </Link>
                <Link
                  href={`/u/${e.handle}`}
                  className="min-w-0 flex-1 truncate text-xs text-paper transition-colors hover:text-ui-blue"
                >
                  {e.name || e.handle}
                </Link>
                <span className={`ml-auto shrink-0 font-mono text-xs font-semibold ${e.rank === 1 ? "text-blue" : "text-paper"}`}>
                  {compact(e.totalTokens)}
                </span>
              </li>
            ))}
            {lbMe && (
              <li className="-mx-4 flex items-center gap-2.5 border-y border-blue/25 bg-blue/[0.07] px-4 py-2">
                <span className="w-4 shrink-0 font-mono text-xs font-bold text-grey">
                  {String(lbMe.rank).padStart(2, "0")}
                </span>
                <Link href={`/u/${lbMe.handle}`} className="shrink-0">
                  <Avatar url={lbMe.avatarUrl} handle={lbMe.handle} size={24} />
                </Link>
                <span className="min-w-0 flex-1 truncate text-xs text-paper">
                  {lbMe.name || lbMe.handle}{" "}
                  <span className="font-mono text-xs text-grey">{t(locale, "side.lbYou")}</span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-xs font-semibold text-paper">
                  {compact(lbMe.totalTokens)}
                </span>
              </li>
            )}
          </ul>
        </Widget>
      )}

      {featured.length > 0 && (
        <Widget title={t(locale, "side.featured")}>
          <ul className="space-y-3">
            {featured.map((f) => {
              const title = f.external ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-paper transition-colors hover:text-ui-blue"
                >
                  {f.title}
                </a>
              ) : (
                <Link
                  href={f.href}
                  className="block truncate text-xs text-paper transition-colors hover:text-ui-blue"
                >
                  {f.title}
                </Link>
              );
              return (
                <li key={`${f.kind}-${f.id}`}>
                  <TrackClick
                    payload={{
                      event: "featured_click",
                      target_kind: f.kind,
                      target_id: String(f.id),
                      meta: { position: "rail" },
                    }}
                  >
                    {title}
                  </TrackClick>
                  <p
                    className="mt-0.5 truncate text-xs leading-relaxed text-grey"
                    title={f.reason}
                  >
                    {f.reason}
                  </p>
                  {f.editorHandle && (
                    <p className="mt-0.5 font-mono text-xs text-grey">
                      {t(locale, "featured.by", { handle: f.editorHandle })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      {/* Demo Night: current event date + signup state/count + link; renders nothing without a current event */}
      {demoNight && (
        <Widget title={t(locale, "dn.widgetTitle")}>
          <Link
            href="/demo-night"
            className="block truncate text-xs text-paper transition-colors hover:text-ui-blue"
          >
            {demoNight.event.title}
          </Link>
          <p className="mt-1 font-mono text-xs text-paper">
            {formatEventTime(demoNight.event.startsAt)}
          </p>
          <p className="mt-1.5 font-mono text-xs text-grey">
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
          <EmptyState variant="inline" message={t(locale, "side.hotEmpty")} />
        ) : (
          <ul className="space-y-2.5">
            {data.hot.map((h, i) => (
              <li key={h.id} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-xs text-grey">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/community/${h.id}`}
                  className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-ui-blue"
                >
                  {h.title}
                </Link>
                <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-grey">
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
              <div className="mt-0.5 text-xs text-grey">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </Widget>

      <Widget title={t(locale, "side.newMembers")}>
        {/* The handle is not repeated on its own line: Link title + Avatar
            alt (initials tile without an avatar) already provide the
            fallback; showing @handle twice in one row is noise. */}
        <div className="flex gap-2">
          {data.newMembers.map((m) => (
            <Link
              key={m.handle}
              href={`/u/${m.handle}`}
              title={`@${m.handle}`}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <Avatar
                url={m.avatarUrl}
                handle={m.handle}
                size={28}
                className="transition-opacity hover:opacity-80"
              />
            </Link>
          ))}
        </div>
      </Widget>
    </>
  );
}
