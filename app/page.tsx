/* Full home page: poster (hero + primary CTA) -> stats bar -> this
   week's featured (falling back to 7-day hot; both empty = not
   rendered) -> join/subscribe -> disclaimer. The poster skin is
   dual-theme (data-theme-scope="poster"): it follows <html data-theme>
   between the night and paper token sets (globals.css's poster block),
   with hairlines, blue accents, and wide-tracked mono; radii follow
   the vibe (data-vibe) — poster zeroes them for hard edges, soft
   rounds them (previously the page had no radius classes at all, so
   vibe switching had no visible effect here); the hero logo ships in
   both themes (only-dark/only-light). The top-right controls match
   the shell's TopBar in set/order/form (search -> notifications ->
   theme -> vibe -> language -> auth); keep iconBtn in sync on both
   sides. The hero uses the SMIL-animated logo (twin stars orbiting in
   8s) with localized alt. The loop remains active under reduced motion
   as the site's one brand-signature exception: companionship in motion
   is the mark's meaning. The top-right auth renders via AuthChip.
   Rendering strategy:
   AuthChip reads cookies + searchParams, so route-level ISR is
   impossible — DB queries go through data-layer ISR instead:
   getHomeData is an unstable_cache (revalidate 300) invalidated
   immediately by the feature/unfeature actions via updateTag("home")
   (see src/lib/home.ts); the poster body stays static markup. */
import Link from "next/link";
import { headers } from "next/headers";
import { Bell } from "lucide-react";
import AuthChip from "@/components/AuthChip";
import CountUpStat from "@/components/CountUpStat";
import { DataMeta } from "@/components/data-display";
import UnreadBadge from "@/components/UnreadBadge";
import { ShortcutsButton } from "@/components/KeyboardShortcuts";
import { TrackClick } from "@/app/(app)/_components/track";
import GlobalSearch from "./(app)/_components/GlobalSearch";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { getHomeData, type HomeFeaturedItem } from "@/src/lib/home";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getUnreadNotificationCount } from "@/src/lib/posts";
import { LocaleToggle, ThemeToggle, VibeToggle } from "./(app)/_components/pref-controls";

/* Top-right control keys: same shape as TopBar's iconBtn in
   (app)/_components — changes must sync both sides. */
const iconBtn =
  "flex h-9 w-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-card hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

const AUTH_ERRORS: Record<string, I18nKey> = {
  state_mismatch: "home.errState",
  oauth_failed: "home.errOauth",
};

/* Featured cards: posts link to the on-site detail; works link out
   directly (no link falls back to /works). */
function FeaturedCard({
  item: f,
  locale,
}: {
  item: HomeFeaturedItem;
  locale: Locale;
}) {
  const titleCls =
    "mt-3 block font-medium leading-snug text-paper transition-colors hover:text-ui-blue";
  const title = f.external ? (
    <a href={f.href} target="_blank" rel="noopener noreferrer" className={titleCls}>
      {f.title}
    </a>
  ) : (
    <Link href={f.href} className={titleCls}>
      {f.title}
    </Link>
  );
  return (
    <article className="rounded-2xl border border-line bg-card p-5 text-left">
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="rounded-md border border-line px-1.5 py-px text-grey">
          {t(locale, f.kind === "post" ? "featured.kindPost" : "featured.kindWork")}
        </span>
        <span className="rounded-md border border-blue/60 px-1.5 py-px text-blue">
          {t(locale, "featured.badge")}
        </span>
      </div>
      <TrackClick
        payload={{
          event: "featured_click",
          target_kind: f.kind,
          target_id: String(f.id),
          meta: { position: "home" },
        }}
      >
        {title}
      </TrackClick>
      {f.excerpt && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-grey">
          {f.excerpt}
        </p>
      )}
      {f.reason && (
        <p className="mt-3 border-l-2 border-blue pl-3 text-sm leading-relaxed text-grey">
          {f.reason}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 font-mono text-xs text-grey">
        {f.authorHref ? (
          <Link href={f.authorHref} className="truncate transition-colors hover:text-ui-blue">
            {f.author}
          </Link>
        ) : (
          <span className="truncate">{f.author}</span>
        )}
        {f.editorHandle && (
          <span className="shrink-0">
            {t(locale, "featured.by", { handle: f.editorHandle })}
          </span>
        )}
      </div>
    </article>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth_error: authError } = await searchParams;
  const requestHeaders = await headers();
  trackEvent("home_view", { kind: "page", id: "home" }, { headers: requestHeaders });
  const user = await getSessionUser();
  const [locale, home, unread] = await Promise.all([
    getLocale(user),
    /* With the DB down the poster still lands: the stats bar/featured
       slot simply don't render, never dragging down the facade. */
    getHomeData().catch(() => null),
    /* Unread badge initial value: same source as (app)/layout (the
       bell shows signed-in only); DB jitter degrades to 0, never
       breaking the facade (getHomeData's tolerance). */
    user ? getUnreadNotificationCount(user.id).catch(() => 0) : 0,
  ]);

  const stats = home
    ? [
        { n: home.stats.members, l: t(locale, "side.members") },
        { n: home.stats.posts, l: t(locale, "side.posts") },
        { n: home.stats.comments, l: t(locale, "side.comments") },
        { n: home.stats.tokens, l: t(locale, "home.tokens") },
      ]
    : null;

  return (
    <main data-theme-scope="poster" className="bg-bg">
      {/* ---- Poster zone: hero + primary CTA (the page's visual anchor) ---- */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        {/* Top-right controls: same set, order, and iconBtn shape as the
            in-shell TopBar; flex-wrap absorbs ultra-narrow viewports. The
            theme toggle flips <html data-theme>, re-skinning the poster
            instantly. */}
        <div className="absolute right-5 top-5 flex max-w-[calc(100vw-2.5rem)] flex-wrap items-center justify-end gap-1.5 font-mono text-xs">
          <GlobalSearch locale={locale} mode="desktop" className={iconBtn} />
          {/* Shortcuts button is desktop-only (>=lg): touch devices have no keyboard */}
          <ShortcutsButton locale={locale} className={`${iconBtn} max-lg:hidden`} />
          {user && (
            <Link
              href="/community/notifications"
              data-tip={t(locale, "topbar.notif")}
              data-tip-side="bottom"
              data-tip-align="right"
              aria-label={t(locale, "topbar.notif")}
              className={`relative ${iconBtn}`}
            >
              <Bell size={15} />
              <UnreadBadge
                initial={unread}
                locale={locale}
                className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue px-1 text-[8px] font-semibold text-bg"
              />
            </Link>
          )}
          <ThemeToggle locale={locale} className={iconBtn} />
          <VibeToggle locale={locale} className={iconBtn} />
          <LocaleToggle locale={locale} className={iconBtn} />
          <span className="ml-1.5 flex items-center gap-3">
            <AuthChip />
          </span>
        </div>
        {typeof authError === "string" && (
          <p className="absolute top-16 font-mono text-xs text-ui-blue">
            {t(locale, AUTH_ERRORS[authError] ?? "home.errGeneric")}
          </p>
        )}
        {/* Both themes share the dark logo mark (logo-animated.svg on a night
            #0E0E13 canvas): dark theme blends it seamlessly into the poster
            background; light theme seats it in a rounded tile whose radius
            follows the vibe (poster square, soft rounded). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-animated.svg"
          alt={t(locale, "home.logoAlt")}
          className="only-dark h-44 w-44"
        />
        {/* Light theme: the dark mark sits in a rounded tile (rounded-2xl via
            tokens — the poster vibe zeroes it into a square brick matching
            the site's engineering edges; soft keeps the 16px card radius)
            instead of a round badge that fights the site's language. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-animated.svg"
          alt=""
          aria-hidden="true"
          className="only-light h-44 w-44 rounded-2xl"
        />
        <h1 className="mt-10 font-mono text-4xl font-semibold tracking-wide">
          kimi<span className="text-ui-blue">.</span>builders
        </h1>
        <p className="mt-5 text-lg font-medium">{t(locale, "home.tagline")}</p>
        <p className="mt-2 text-sm text-grey">{t(locale, "home.heroSub")}</p>
        <Link
          href="/community"
          className="mt-12 inline-flex w-72 items-center justify-center rounded-lg bg-blue py-3.5 font-mono text-sm font-semibold tracking-widest text-bg transition-opacity hover:opacity-85"
        >
          {t(locale, "home.cta")} →
        </Link>
        {/* Site entries: bordered button row under the primary CTA, fixed
            width (identical for zh/en, easy to hit at a glance); grouped by
            content section — the usage leaderboard entrance stays with the
            right rail and the usage section, not here. */}
        <nav className="mt-6 flex flex-wrap items-stretch justify-center gap-2.5 font-mono text-xs">
          {(
            [
              ["/community", "nav.community", "home.subCommunity"],
              ["/explore", "nav.explore", "home.subExplore"],
              ["/works", "nav.works", "home.subWorks"],
              ["/awesome", "nav.awesome", "home.subAwesome"],
            ] as const
          ).map(([href, key, subKey]) => (
            <Link
              key={href}
              href={href}
              className="kb-navlink flex w-36 flex-col items-center gap-1 rounded-lg border border-line px-2 py-2.5 text-grey transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <span className="tracking-wider">{t(locale, key)}</span>
              <span className="text-xs tracking-normal text-grey/70">
                {t(locale, subKey)}
              </span>
            </Link>
          ))}
        </nav>
      </section>

      {/* ---- Stats strip: members / posts / comments / all-time tokens (live data) ---- */}
      {stats && (
        <section className="border-y border-line">
          <div className="mx-auto grid max-w-4xl grid-cols-3 gap-y-8 px-4 py-10 sm:grid-cols-4 sm:px-6 sm:py-12">
            {stats.map((s, index) => (
              <div
                key={s.l}
                className={`text-center ${
                  index === 3
                    ? "col-span-3 border-t border-line pt-8 sm:col-span-1 sm:border-l sm:border-t-0 sm:pt-0"
                    : ""
                }`}
              >
                <div className={`font-mono text-3xl font-semibold tracking-wide ${index === 3 ? "text-ui-blue" : ""}`}>
                  <CountUpStat value={s.n} locale={locale} />
                </div>
                <div className="mt-2 font-mono text-xs tracking-[0.08em] text-grey">
                  {s.l}
                </div>
                {index === 3 && (
                  <DataMeta
                    items={[locale === "zh" ? "公开成员累计" : "Public member total"]}
                    className="mt-2 justify-center"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Weekly picks: editor-signed; falls back to 7-day hot when empty; renders nothing when both are empty ---- */}
      {home?.featured.length ? (
        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-center font-mono text-xs tracking-[0.08em] text-grey">
            {t(locale, "home.featured")}
          </h2>
          <p className="mt-3 text-center text-xs text-grey">
            {t(locale, "home.featuredSub")}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {home.featured.map((f) => (
              <FeaturedCard key={`${f.kind}-${f.id}`} item={f} locale={locale} />
            ))}
          </div>
        </section>
      ) : home?.hot.length ? (
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center font-mono text-xs tracking-[0.08em] text-grey">
            {t(locale, "side.hot")}
          </h2>
          <ul className="mt-8 border-y border-line">
            {home.hot.map((h, i) => (
              <li key={h.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/community/${h.id}`}
                  className="flex items-baseline gap-4 py-3 transition-colors hover:text-ui-blue"
                >
                  {/* Rank numbers read as a leaderboard; a lone item is
                      just a link, so the index only renders from 2 up. */}
                  {home.hot.length >= 2 && (
                    <span className="shrink-0 font-mono text-xs text-grey">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-paper">
                    {h.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-grey">
                    {t(locale, "post.comments", { n: h.commentCount })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- Join / subscribe ---- */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-center font-mono text-xs tracking-[0.08em] text-grey">
          {t(locale, "home.join")}
        </h2>
        <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
          <TrackClick
            payload={{
              event: "join_click",
              target_kind: "slot",
              target_id: "org",
              meta: { slot: "org" },
            }}
          >
            <a
              href="https://github.com/kimi-builders"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-line bg-card p-5 transition-colors hover:border-paper/20"
            >
              <h3 className="font-mono text-sm text-paper transition-colors group-hover:text-ui-blue">
                GitHub
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {t(locale, "home.joinDisc")}
              </p>
              <span className="mt-3 inline-block font-mono text-xs text-ui-blue">
                {t(locale, "home.joinDiscCta")} →
              </span>
            </a>
          </TrackClick>
          <TrackClick
            payload={{
              event: "join_click",
              target_kind: "slot",
              target_id: "awesome",
              meta: { slot: "awesome" },
            }}
          >
            <a
              href="https://github.com/kimi-builders/awesome-kimi-builders"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-line bg-card p-5 transition-colors hover:border-paper/20"
            >
              <h3 className="font-mono text-sm text-paper transition-colors group-hover:text-ui-blue">
                Awesome Kimi Builders
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {t(locale, "home.joinAwesome")}
              </p>
              <span className="mt-3 inline-block font-mono text-xs text-ui-blue">
                {t(locale, "home.joinAwesomeCta")} →
              </span>
            </a>
          </TrackClick>
          <TrackClick
            payload={{
              event: "join_click",
              target_kind: "slot",
              target_id: "mail",
              meta: { slot: "mail" },
            }}
          >
            <a
              href="mailto:hi@kimi.builders"
              className="group rounded-2xl border border-line bg-card p-5 transition-colors hover:border-paper/20"
            >
              <h3 className="font-mono text-sm text-paper transition-colors group-hover:text-ui-blue">
                hi@kimi.builders
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {t(locale, "home.joinMail")}
              </p>
              <span className="mt-3 inline-block font-mono text-xs text-ui-blue">
                {t(locale, "home.joinMailCta")} →
              </span>
            </a>
          </TrackClick>
        </div>
      </section>

      {/* ---- Footer: hairline closure + brand echo + disclaimers (follows
          the UI language). The container shares the stats/picks/join grid
          width (max-w-4xl); KIMI.BUILDERS borrows the mono wide-tracking
          voice of page section labels, blue dot echoing the wordmark; the
          two disclaimer lines sit in a light hierarchy — community note in
          text-grey, legal note one step dimmer. ---- */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <p className="text-center font-mono text-xs tracking-[0.08em] text-grey">
            KIMI<span className="text-ui-blue">.</span>BUILDERS
          </p>
          <div className="mx-auto mt-5 max-w-xl text-center text-xs leading-relaxed">
            <p className="text-grey">{t(locale, "home.footerLine1")}</p>
            <p className="mt-1 text-grey/70">{t(locale, "home.footerLine2")}</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
