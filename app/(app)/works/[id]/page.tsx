/* Work detail: breadcrumb + clean H1 + meta row (author/time/kind/
   declared tokens/★featured; private/hidden warning pills) + action bar
   (try/support/share/owner & moderation actions) + gallery + long
   description + a label/value hairline info panel (inline below xl;
   from xl the rail's Work Info card replaces it, see the rail registry
   work kind) + the single-level comment section at the bottom.
   Browsing needs no login; support/comments do (comment/vote quota
   limits). An @kimi in a comment summons the bot (the work's ai_reply
   switch + the ai_summon quota). Missing/deleted works get friendly
   copy, never a hard 404. Layout alignment: H1/comment H2 use the
   .kb-h1/.kb-h2 primitives, attribute chips drop to label scale
   (text-xs), spacing back on the 4px ladder. */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, ExternalLink, Heart, MessageCircle, Shell } from "lucide-react";
import Avatar from "@/components/Avatar";
import AgentIcon from "@/components/AgentIcon";
import LoadMore from "@/components/LoadMore";
import Markdown from "@/components/Markdown";
import ModelIcon from "@/components/ModelIcon";
import ShareButton from "@/components/ShareButton";
import WorkKindIcon from "@/components/WorkKindIcon";
import { agentName } from "@/src/lib/agents";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { compactNumber, plainExcerpt, relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { modelFamilyName } from "@/src/lib/model-families";
import { detailMetadata } from "@/src/lib/page-metadata";
import { mediaUrl } from "@/src/lib/storage";
import { workKindLabel } from "@/src/lib/work-kinds";
import { getWorksSource } from "@/src/lib/works-view-server";
import {
  canViewWork,
  claimBadgeOf,
  getAuthorClaimContext,
  getWork,
  getWorkDetail,
  hasWorkVote,
} from "@/src/lib/works";
import { loadMoreWorkCommentsAction } from "../actions";
import { loadWorkComments } from "../_components/work-comment-page";
import WorkCommentForm from "../_components/WorkCommentForm";
import WorkGallery from "../_components/WorkGallery";
import WorkOwnerActions from "../_components/WorkOwnerActions";
import WorkScreenshot from "../_components/WorkScreenshot";
import WorkVoteButton from "../_components/WorkVoteButton";
import ModToolbar from "../../admin/_components/ModToolbar";
import ModMenu from "../../community/_components/ModMenu";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const work = await getWork(Number(id) || 0);
  if (!work) return { title: "kimi.builders" };
  /* Private works never leak their title to non-authors; hidden works
     never leak it to non-authors/non-mods (tab titles and share
     previews count). */
  const user = await getSessionUser();
  if (!canViewWork(work, user)) return { title: "kimi.builders" };
  const locale = await getLocale(user);
  return detailMetadata({
    title: `${work.name} — kimi.builders`,
    description:
      work.tagline || plainExcerpt(work.descriptionMd, 160) || t(locale, "metaDesc.works"),
    path: `/works/${id}`,
    locale,
  });
}

/* Missing/removed: friendly copy + back to the source list (the
   source memory wins). */
function WorkGone({ locale, href, label }: { locale: Locale; href: string; label: string }) {
  return (
    <div className="mt-12 rounded-2xl border border-line bg-card p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-moon text-ui-blue">
        <Shell size={23} aria-hidden="true" />
      </span>
      <p className="text-sm leading-relaxed text-grey">
        {t(locale, "works.notFound")}
      </p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        {label}
      </Link>
    </div>
  );
}

export default async function WorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workId = Number(id);
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* Source-list memory (kb-works-src, written by proxy): "back"
     returns to the list the user came from; with a work loaded it
     falls back to work.source, otherwise only /works remains. */
  const fromList = await getWorksSource();
  const goneHref = fromList === "awesome" ? "/awesome" : "/works";
  const goneLabel = t(
    locale,
    fromList === "awesome" ? "works.backToAwesome" : "works.backToWorks",
  );
  if (!Number.isInteger(workId) || workId <= 0)
    return <WorkGone locale={locale} href={goneHref} label={goneLabel} />;
  const work = await getWorkDetail(workId);
  /* Private works read as "missing" to others; hidden works open only
     for the author and admin/mod (moderation review) — everyone else
     gets the same friendly copy as deleted/missing, so the page is
     never an existence oracle. */
  if (!work || !canViewWork(work, user))
    return <WorkGone locale={locale} href={goneHref} label={goneLabel} />;
  const requestHeaders = await headers();
  trackEvent("work_view", { kind: "work", id: workId }, { headers: requestHeaders });

  const [voted, claimCtx, comments] = await Promise.all([
    user ? hasWorkVote(user.id, workId) : false,
    /* Claim badge: the author's verifiable total + the sum of claims
       across their works (internal definition, no opt-in gate); shares
       the request-scoped cache with the rail metadata card
       (getAuthorClaimContext — no extra query). */
    work.userId !== null
      ? getAuthorClaimContext(work.userId)
      : Promise.resolve(null),
    loadWorkComments(workId, work.userId, user, locale),
  ]);
  const claimBadge =
    work.userId !== null && claimCtx
      ? claimBadgeOf(
          work,
          new Map([[work.userId, claimCtx.total]]),
          new Map([[work.userId, claimCtx.claimSum]]),
        )
      : null;

  return (
    <div>
      <article className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      {work.hiddenAt && (
        <p className="mb-4 rounded-xl border border-status-danger/30 bg-status-danger/[0.06] px-3 py-2 text-xs leading-relaxed text-status-danger-fg">
          {t(locale, "mod.hiddenBanner")}
          {work.hiddenReason ? ` — ${work.hiddenReason}` : ""}
        </p>
      )}
      {/* Breadcrumb: the remembered source list wins (member works also
          appear on /awesome, so guessing from work.source would send an
          Awesome visitor back to the work wall); without memory, fall back
          to work.source. */}
      <div className="flex items-center gap-2 font-mono text-sm tracking-wider text-grey">
        <Link
          href={(fromList ?? work.source) === "awesome" ? "/awesome" : "/works"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-moon hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, (fromList ?? work.source) === "awesome" ? "nav.awesome" : "nav.works")}
        </Link>
        <span className="truncate">{work.name}</span>
      </div>

      {/* Byline above the title (post-detail grammar): the author anchors
          the card, the title reads as their words; identity + state flags
          share the row, attribute chips stay out of the header — the
          right rail (>=xl) and the inline info bar (<xl) already carry
          kind/scope/status/declaration, repeating them here tripled the
          metadata. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-xs leading-5 text-grey">
        {work.source === "awesome" && work.authorLabel ? (
          <>
            {/* The original author links to the GitHub profile when
                handle-shaped, otherwise degrades to plain text; the
                recommender is kept on the detail page (list cards omit
                it). */}
            {/^[A-Za-z0-9-]{1,39}$/.test(work.authorLabel) ? (
              <a
                href={`https://github.com/${work.authorLabel}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-paper transition-colors hover:text-ui-blue"
              >
                {t(locale, "awesome.by", { name: work.authorLabel })}
              </a>
            ) : (
              <span>{t(locale, "awesome.by", { name: work.authorLabel })}</span>
            )}
            {work.handle && (
              <span className="inline-flex items-center gap-1.5">
                · {t(locale, "awesome.recommenderShort")}
                <Avatar url={work.avatarUrl} handle={work.handle} size={20} />
                <Link
                  href={`/u/${work.handle}`}
                  className="text-paper transition-colors hover:text-ui-blue"
                >
                  @{work.handle}
                </Link>
              </span>
            )}
          </>
        ) : work.handle ? (
          <span className="inline-flex items-center gap-1.5">
            <Avatar url={work.avatarUrl} handle={work.handle} size={20} />
            <Link
              href={`/u/${work.handle}`}
              className="text-paper transition-colors hover:text-ui-blue"
            >
              @{work.handle}
            </Link>
          </span>
        ) : (
          <span>{t(locale, "awesome.by", { name: work.authorLabel })}</span>
        )}
        <span>· {relTime(work.createdAt, locale)}</span>
        {work.visibility === "private" && (
          <span className="inline-block rounded-md border border-line px-1.5 py-px font-mono text-xs font-medium text-grey">
            {t(locale, "works.private")}
          </span>
        )}
        {work.hiddenAt && (
          <span
            className="inline-block rounded-md border border-status-danger/60 px-1.5 py-px font-mono text-xs font-medium text-status-danger-fg"
            title={work.hiddenReason ?? undefined}
          >
            {t(locale, "mod.hiddenBadge")}
          </span>
        )}
      </div>

      {/* Title row: the H1 stays clean; the featured star is the one
          badge the rail doesn't carry, it rides beside the title. */}
      <div className="mt-2 flex items-start gap-3">
        {work.logoKey && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mediaUrl(work.logoKey)}
            alt=""
            className="mt-0.5 size-11 shrink-0 rounded-lg border border-line object-cover"
          />
        )}
        <h1 className="kb-h1">
          {work.name}
        </h1>
        {work.featuredAt && (
          <span
            className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-blue/50 bg-blue/10 px-1.5 py-px font-mono text-xs text-blue"
            title={`${work.featuredReason ?? ""}${
              work.editorHandle
                ? ` ${t(locale, "featured.by", { handle: work.editorHandle })}`
                : ""
            }`}
          >
            ★ {t(locale, "featured.badge")}
          </span>
        )}
      </div>

      {/* Action bar (above media): try and support share one equal-width,
          equal-height track at every viewport; share and owner/moderation
          actions remain the quieter trailing group. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div
          className={`grid w-full gap-3 ${
            work.url ? "grid-cols-2 sm:w-[28rem]" : "grid-cols-1 sm:w-56"
          }`}
        >
          {work.url && (
            <a
              href={work.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-blue bg-blue px-2 text-xs font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:gap-1.5 sm:px-3 sm:text-sm"
            >
              <ExternalLink size={13} />
              {t(locale, work.kind === "demo" ? "works.tryIt" : "works.openProject")}
            </a>
          )}
          {user ? (
            <WorkVoteButton
              workId={work.id}
              voted={voted}
              count={work.voteCount}
              locale={locale}
            />
          ) : (
            <span
              className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-line px-2 font-mono text-xs whitespace-nowrap text-grey sm:gap-1.5 sm:px-3 sm:text-sm"
              title={t(locale, "works.loginToSupport")}
            >
              <Heart size={13} />
              {t(locale, "works.support")} · {work.voteCount}
            </span>
          )}
        </div>
        <span className="ml-auto flex items-center gap-3">
          {user && work.userId === user.id && (
            <span className="flex items-center gap-3 font-mono text-sm text-grey">
              <WorkOwnerActions
                workId={work.id}
                locale={locale}
                redirectTo={(fromList ?? work.source) === "awesome" ? "/awesome" : "/works"}
              />
            </span>
          )}
          {/* Moderation behind the shared menu entry (post-detail
              grammar); re-authorized at the action layer */}
          {user && canModerate(user.role) && (
            <ModMenu locale={locale}>
              <ModToolbar
                targetType="work"
                targetId={work.id}
                hidden={!!work.hiddenAt}
                isAdmin={user.role === "admin"}
                locale={locale}
                redirectAfter={(fromList ?? work.source) === "awesome" ? "/awesome" : "/works"}
              />
            </ModMenu>
          )}
          <ShareButton
            path={`/works/${work.id}`}
            title={work.name}
            locale={locale}
            /* Private works have no poster (the route 404s): the button
               offers no poster entry, same as private posts. */
            posterHref={
              work.visibility === "public"
                ? `/api/share/work/${work.id}?locale=${locale}`
                : undefined
            }
            posterSurface={work.visibility === "public" ? "work" : undefined}
          />
        </span>
      </div>

      {/* Media area: with gallery images, the gallery (large cover +
          thumbnails); with only a legacy external screenshot, that single
          image; otherwise nothing renders — the generated name tile is the
          list-cover fallback, and the detail header already shows logo +
          name, so repeating the tile here would be redundant. */}
      {(work.imageKeys.length > 0 || work.screenshotUrl) && (
        <div className="mt-6">
          {work.imageKeys.length > 0 ? (
            <WorkGallery
              keys={work.imageKeys}
              name={work.name}
              locale={locale}
              fit={work.coverFit}
            />
          ) : (
            <WorkScreenshot
              url={work.screenshotUrl}
              name={work.name}
              logoUrl={work.logoKey ? mediaUrl(work.logoKey) : ""}
            />
          )}
        </div>
      )}

      {/* Body + info bar: below xl the info bar sinks to a two-column grid
          at the bottom (the old 220px sidebar squeezed the body to ~360px
          at 640-1023px viewports — cramped reading; sunk, the body keeps
          full width and info rows pack two columns); >=xl the right-rail
          metadata card replaces it (work kind in the rail registry). */}
      <div className="mt-8 space-y-8">
        <div>
          {/* Long description first (description_md), falling back to tagline */}
          {(work.descriptionMd || work.tagline) && (
            <Markdown source={work.descriptionMd || work.tagline} />
          )}
        </div>

        {/* Inline info bar (<xl): same label/value hairline rows as the right rail, two columns from sm */}
        <aside className="border-t border-line pt-6 xl:hidden">
          <dl className="grid gap-x-8 font-mono text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 border-b border-line py-3">
              <dt className="text-grey">
                {t(locale, work.source === "awesome" && work.authorLabel ? "works.sideOriginalAuthor" : "works.sideAuthor")}
              </dt>
              <dd className="min-w-0 text-paper">
                {work.source === "awesome" && work.authorLabel ? (
                  <span className="truncate">{work.authorLabel}</span>
                ) : work.handle ? (
                  <Link
                    href={`/u/${work.handle}`}
                    className="flex items-center gap-1.5 transition-colors hover:text-ui-blue"
                  >
                    <Avatar url={work.avatarUrl} handle={work.handle} size={18} className="shrink-0" />
                    <span className="truncate">@{work.handle}</span>
                  </Link>
                ) : (
                  <span className="truncate">{work.authorLabel}</span>
                )}
              </dd>
            </div>
            {claimBadge !== null && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-3">
                <dt className="text-grey">{t(locale, "works.declared")}</dt>
                <dd className="text-ui-blue" title={t(locale, "works.badgeTitle")}>
                  {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
                </dd>
              </div>
            )}
            {work.scope && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-3">
                <dt className="text-grey">{t(locale, "awesome.scope")}</dt>
                <dd className="text-paper">
                  {t(
                    locale,
                    work.scope === "eco"
                      ? "awesome.scopeEco"
                      : work.scope === "part"
                        ? "awesome.scopePart"
                        : "awesome.scopeBase",
                  )}
                </dd>
              </div>
            )}
            {work.status !== "released" && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-3">
                <dt className="text-grey">{t(locale, "works.status")}</dt>
                <dd className="text-paper">
                  {t(
                    locale,
                    work.status === "planning"
                      ? "works.statusPlanning"
                      : work.status === "building"
                        ? "works.statusBuilding"
                        : "works.statusArchived",
                  )}
                </dd>
              </div>
            )}
            {work.agents.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-3">
                <dt className="shrink-0 text-grey">{t(locale, "works.agents")}</dt>
                <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-paper">
                  {work.agents.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1">
                      <AgentIcon id={a} size={11} />
                      {agentName(a)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-b border-line py-3">
              <dt className="text-grey">{t(locale, "works.kind")}</dt>
              <dd className="inline-flex items-center gap-1 text-paper">
                <WorkKindIcon id={work.kind} size={11} />
                {workKindLabel(work.kind, locale === "zh")}
              </dd>
            </div>
            {work.models.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-3">
                <dt className="shrink-0 text-grey">{t(locale, "works.sideModels")}</dt>
                <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-paper">
                  {work.models.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1">
                      <ModelIcon id={m} size={11} />
                      {modelFamilyName(m, locale)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {work.tags.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-3">
                <dt className="shrink-0 text-grey">{t(locale, "works.tagsShort")}</dt>
                <dd className="min-w-0 truncate text-right text-paper" title={work.tags.join(", ")}>
                  {work.tags.join(", ")}
                </dd>
              </div>
            )}
            {(work.url || work.repoUrl) && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-3">
                <dt className="text-grey">{t(locale, "works.sideLinks")}</dt>
                <dd className="inline-flex items-center gap-3">
                  {work.url && (
                    <a href={work.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ui-blue underline-offset-4 hover:underline">
                      <ExternalLink size={11} />
                      {t(locale, "works.visit")}
                    </a>
                  )}
                  {work.repoUrl && (
                    <a href={work.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-grey transition-colors hover:text-ui-blue">
                      <ExternalLink size={11} />
                      {t(locale, "works.repo")}
                    </a>
                  )}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-b border-line py-3">
              <dt className="text-grey">{t(locale, "works.published")}</dt>
              <dd className="text-paper">{relTime(work.createdAt, locale)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-grey">{t(locale, "works.support")}</dt>
              <dd className="inline-flex items-center gap-1 text-paper">
                <Heart size={11} />
                {work.voteCount}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
      </article>

      {/* Comments: talk with the author about this work (single level;
              signed-in to post, rate-limited; author or work owner may
              delete; AI comments (summoned) are moderated separately) */}
      <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-6">
        <h2 id="comments" className="kb-h2">
          {t(locale, "works.discuss")} ·{" "}
          {t(locale, "post.comments", { n: comments.total })}
        </h2>
        {comments.nodes.length === 0 ? (
          <p className="mt-5 flex items-center justify-center gap-2 py-6 text-center text-sm text-grey">
            <MessageCircle size={15} className="text-grey/70" aria-hidden="true" />
            {t(locale, "works.noComments")}
          </p>
        ) : (
          /* LoadMore inside the container: appended pages drop into the
             hairline-separated flow; comment rows get no rounded box. */
          <div className="mt-4 divide-y divide-line">
            {comments.nodes}
            {/* The key carries first-page size and cursor: posting/deleting a
                comment triggers a refresh, any first-page change remounts,
                appended pages are discarded (same semantics as the work
                wall / comment section) */}
            <LoadMore
              key={`wc-${comments.nodes.length}-${comments.nextCursor ?? "end"}-${locale}`}
              initialCursor={comments.nextCursor}
              load={loadMoreWorkCommentsAction.bind(null, workId)}
              locale={locale}
            />
          </div>
        )}
        {user ? (
          <WorkCommentForm workId={workId} locale={locale} />
        ) : (
          /* Signed out: the single login entry (a modal with return
             redirect), the site-wide pattern — no bare OAuth links. */
          <p className="mt-4 border-t border-line pt-4 text-sm text-grey">
            {t(locale, "post.loginToComment")}
            <Link
              href={`/login?next=${encodeURIComponent(`/works/${workId}#comments`)}`}
              className="ml-2 text-paper underline decoration-ui-blue/60 underline-offset-4 hover:text-ui-blue"
            >
              {t(locale, "auth.login")}
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
