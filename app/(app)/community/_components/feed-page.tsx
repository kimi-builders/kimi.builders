/* Server assembly of one feed page: the keyset paged query + vote
   state (one batched IN query, no N+1) + card rendering. Shared by the
   community first page (SSR) and the "load more" server action so both
   entries emit identical output (same pattern as comment-page.tsx). */
import type { ReactNode } from "react";
import type { Locale } from "@/src/lib/i18n";
import { getFeedPage, getPostReactions } from "@/src/lib/posts";
import { getPublicFeedFirstPage } from "@/src/lib/public-feed-cache";
import { publicFeedCacheScope } from "@/src/lib/public-feed";
import PostCard from "./PostCard";

export interface FeedPageData {
  nodes: ReactNode[];
  nextCursor: string | null;
}

export async function loadFeedCards(
  opts: {
    sort: "hot" | "new";
    category?: string;
    solved?: boolean;
    subscriberId?: number;
    viewerId?: number;
    after?: string;
  },
  locale: Locale,
): Promise<FeedPageData> {
  const publicScope = publicFeedCacheScope(opts);
  const page = publicScope
    ? await getPublicFeedFirstPage(publicScope)
    : await getFeedPage(opts);
  const reacted = opts.viewerId
    ? await getPostReactions(
        opts.viewerId,
        page.posts.map((p) => p.id),
      )
    : { up: new Set<number>(), down: new Set<number>() };
  return {
    nodes: page.posts.map((p) => (
      <PostCard
        key={p.id}
        post={p}
        locale={locale}
        loggedIn={!!opts.viewerId}
        up={reacted.up.has(p.id)}
        down={reacted.down.has(p.id)}
      />
    )),
    nextCursor: page.nextCursor,
  };
}
