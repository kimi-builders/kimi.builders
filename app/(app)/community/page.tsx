/* Community feed: the card stream (rounded cards + formatted excerpts +
   pill action rows). Top: a quick-post bar (signed-in, opens the new-post
   modal) + a sort seg (hot/new/subscribed) + topic pills. Category
   filtering moved from the rail into the feed bar; inline votes are
   interactive (reaction state via one batched IN query, no N+1).
   Titles are optional: untitled posts carry a body excerpt + "read
   full". A signed-in user's private posts appear only in their own feed
   (labeled); posts they down-voted disappear from their feed. Paging:
   keyset cursors + "load more" appends (the server action returns a
   rendered page); card rendering lives in _components/PostCard, and
   the first page and appends share _components/feed-page. */
import Link from "next/link";
import type { Metadata } from "next";
import { SquarePen } from "lucide-react";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";
import LoadMore from "@/components/LoadMore";
import PageHeader from "@/components/PageHeader";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_FLOW,
  SEG_ITEM_IDLE,
  SEG_WRAP,
  SEG_WRAP_FLOW,
} from "@/components/seg-classes";
import { getSessionUser } from "@/src/lib/auth/session";
import { CATEGORIES, categoryLabel } from "@/src/lib/categories";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { loadMorePostsAction } from "./actions";
import { loadFeedCards } from "./_components/feed-page";

/* Every other section ships a page-specific title; without this the
   tab/history/SEO fell back to the site-default title. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "community.pageTitle"), description: t(locale, "metaDesc.community") };
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; cat?: string; sub?: string; solved?: string }>;
}) {
  const { sort, cat, sub, solved } = await searchParams;
  const currentSort = sort === "new" ? "new" : "hot";
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const subOnly = sub === "1" && !!user;
  const solvedOnly = solved === "1";
  const feed = await loadFeedCards(
    {
      sort: currentSort,
      category: cat,
      solved: solvedOnly,
      subscriberId: subOnly ? user.id : undefined,
      viewerId: user?.id,
    },
    locale,
  );

  const feedHref = (changes: {
    sort?: string;
    cat?: string | null;
    sub?: string | null;
    solved?: string | null;
  }) => {
    const params = new URLSearchParams();
    const nextSort = changes.sort ?? currentSort;
    const nextCat = changes.cat === undefined ? cat : changes.cat;
    const nextSub = changes.sub === undefined ? (subOnly ? "1" : null) : changes.sub;
    const nextSolved = changes.solved === undefined ? (solvedOnly ? "1" : null) : changes.solved;
    if (nextSort !== "hot") params.set("sort", nextSort);
    if (nextCat) params.set("cat", nextCat);
    if (nextSub) params.set("sub", nextSub);
    if (nextSolved) params.set("solved", nextSolved);
    const qs = params.toString();
    return qs ? `/community?${qs}` : "/community";
  };

  /* Stagger entrance only on the default view: topic/sort switches are
     server re-renders — all card keys change and the first 8 cards
     would replay the entrance animation, reading as a stutter. */
  const defaultFeedView =
    currentSort === "hot" && !cat && !subOnly && !solvedOnly;

  const sortItems = [
    { key: "hot", label: t(locale, "feed.hot"), href: feedHref({ sort: "hot", sub: null }), active: currentSort === "hot" && !subOnly },
    { key: "new", label: t(locale, "feed.new"), href: feedHref({ sort: "new", sub: null }), active: currentSort === "new" && !subOnly },
    ...(user
      ? [{ key: "sub", label: t(locale, "feed.sub"), href: "/community?sub=1", active: subOnly }]
      : []),
  ];

  return (
    <div>
      {/* The page head uses the shared PageHeader (copy consistency): the
          same grammar as the other sections (— positioning eyebrow + kb-h1
          + kb-lede); the serif brand echo is carried by the explore area
          (chapter banner / editor covenant) instead. */}
      <PageHeader
        eyebrow={t(locale, "community.eyebrow")}
        title={t(locale, "nav.community")}
        lede={t(locale, "community.lede")}
      />
      {user && (
        <Link
          href="/community/new"
          className="mb-4 mt-6 flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 transition-colors hover:border-paper/25"
        >
          <Avatar url={user.avatarUrl} handle={user.handle} size={32} />
          <span className="min-w-0 flex-1 truncate text-sm text-grey">
            {t(locale, "feed.quickPost")}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ui-blue">
            <SquarePen size={14} aria-hidden="true" />
            {t(locale, "nav.post")}
          </span>
        </Link>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <nav aria-label={t(locale, "feed.sortNav")} className={SEG_WRAP}>
          {sortItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              scroll={false}
              aria-current={item.active ? "page" : undefined}
              className={`${SEG_ITEM} ${item.active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* Topic tabs: the shared segmented grammar (seg-classes, inverted
            solid-block selected state) in the wrappable variant — the
            group folds when there are many options or long EN labels
            (Showcase/Feedback) instead of squeezing a six-way equal grid;
            corners follow the vibe tokens (the old gap-px grid was square
            in both vibes). The solved toggle stays as is: state is a
            different mental model from topic. */}
        <nav
          aria-label={t(locale, "feed.topicNav")}
          className={`${SEG_WRAP_FLOW} order-last min-w-0 md:order-none md:justify-self-start`}
        >
          <Link
            href={feedHref({ cat: null })}
            scroll={false}
            aria-current={!cat ? "page" : undefined}
            className={`${SEG_ITEM_FLOW} ${!cat ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
          >
            {t(locale, "feed.topicsAll")}
          </Link>
          {CATEGORIES.map((c) => {
            const active = cat === c.id;
            return (
              <Link
                key={c.id}
                href={feedHref({ cat: c.id })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`${SEG_ITEM_FLOW} ${active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                {categoryLabel(locale, c.id)}
              </Link>
            );
          })}
        </nav>
        {/* Solved-only: a state filter, not a topic — it sits on the sort row
            as an outlined pill, distinguishing the two mental models from
            the borderless topic tabs. Spec matches the tool-row controls
            (rounded-lg + min-h-11 sm:min-h-9). */}
        <Link
          href={feedHref({ solved: solvedOnly ? null : "1" })}
          scroll={false}
          aria-current={solvedOnly ? "page" : undefined}
          className={`inline-flex h-11 min-h-0 shrink-0 items-center gap-1 justify-self-start rounded-lg border px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue md:justify-self-end ${
            solvedOnly
              ? "border-blue/60 bg-blue/10 font-semibold text-blue"
              : "border-line text-grey hover:border-ui-blue/50 hover:text-ui-blue"
          }`}
        >
          ✓ {t(locale, "feed.solvedOnly")}
        </Link>
      </div>

      {feed.nodes.length === 0 ? (
        /* Empty community = an explicit CTA, not cheerleading alone;
           the subscribed empty state (subOnly) is a filter with no
           results — content guidance, but no post button. A topic/
           solved filter with no results states the filtered truth and
           hands back the way out: it must not claim the community
           itself is empty (the rail shows live counts) and carries no
           content-guidance slogans. */
        cat || solvedOnly ? (
          <EmptyState
            className="mt-4"
            message={t(locale, "feed.emptyFiltered")}
            actions={
              <Link
                href={feedHref({ cat: null, sub: null, solved: null })}
                scroll={false}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 font-mono text-xs text-paper transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                {t(locale, "feed.emptyFilteredCta")}
              </Link>
            }
          />
        ) : (
          <EmptyState
            className="mt-4"
            message={subOnly ? t(locale, "feed.emptySub") : t(locale, "feed.empty")}
            hint={!subOnly ? t(locale, "feed.emptyHint") : undefined}
            actions={
              !subOnly ? (
                <Link
                  href={
                    user
                      ? "/community/new"
                      : `/login?next=${encodeURIComponent("/community/new")}`
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <SquarePen size={14} aria-hidden="true" />
                  {t(locale, "feed.emptyCta")}
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <div className={`${defaultFeedView ? "stagger-in " : ""}mt-4 space-y-3`}>
          {feed.nodes}
          <LoadMore
            key={`${currentSort}-${cat ?? ""}-${subOnly ? "sub" : ""}-${locale}`}
            initialCursor={feed.nextCursor}
            load={loadMorePostsAction.bind(null, {
              sort: currentSort,
              cat: cat ?? null,
              sub: subOnly,
            })}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
