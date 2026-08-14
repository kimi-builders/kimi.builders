/* Shared cache for anonymous community-feed page 1 only. cacheComponents is
   intentionally disabled in this app, so this remains on unstable_cache.
   The callback receives only bounded public scope and returns a JSON-only DTO. */
import { unstable_cache } from "next/cache";
import {
  PUBLIC_POSTS_CACHE_TAG,
  PUBLIC_USERS_CACHE_TAG,
} from "./cache-tags";
import { getFeedPage, type FeedPage } from "./posts";
import {
  hydratePublicFeedPage,
  publicFeedCacheScope,
  toPublicFeedPageDto,
  type PublicFeedCacheScope,
  type PublicFeedPageDto,
} from "./public-feed";

export const PUBLIC_FEED_REVALIDATE_SECONDS = 30;

async function loadAnonymousFirstPageDto(
  sort: "hot" | "new",
  categoryKey: PublicFeedCacheScope["category"],
  solved: boolean,
): Promise<PublicFeedPageDto> {
  /* No viewer, subscriber, or cursor is accepted here. feedPageQuery therefore
     applies public + non-hidden predicates before the database returns rows. */
  const page = await getFeedPage({
    sort,
    category: categoryKey ?? undefined,
    solved,
  });
  return toPublicFeedPageDto(page);
}

const getCachedAnonymousFirstPageDto = unstable_cache(
  loadAnonymousFirstPageDto,
  ["community-feed-anonymous-first-page-v1"],
  {
    revalidate: PUBLIC_FEED_REVALIDATE_SECONDS,
    tags: [PUBLIC_POSTS_CACHE_TAG, PUBLIC_USERS_CACHE_TAG],
  },
);

export async function getPublicFeedFirstPage(
  scope: PublicFeedCacheScope,
): Promise<FeedPage> {
  /* Re-canonicalize at the cache entrypoint too: TypeScript types are erased,
     so even an accidental any-cast cannot create an unbounded runtime key. */
  const bounded = publicFeedCacheScope({
    sort: scope.sort,
    category: scope.category ?? undefined,
    solved: scope.solved,
  });
  const dto = await getCachedAnonymousFirstPageDto(
    bounded?.sort ?? "hot",
    bounded?.category ?? null,
    bounded?.solved ?? false,
  );
  return hydratePublicFeedPage(dto);
}
