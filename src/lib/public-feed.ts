/* Pure policy + DTO boundary for the shared anonymous community-feed cache.
   Request/viewer state never crosses this file's cache-scope gate, and Dates are
   converted to ISO strings before Next serializes the cached payload. */
import { CATEGORIES, type CategoryId } from "./categories";
import type { FeedPage, FeedPost } from "./posts";

export interface PublicFeedCacheScope {
  sort: "hot" | "new";
  category: CategoryId | null;
}

export interface PublicFeedScopeInput {
  sort: string;
  category?: string;
  subscriberId?: number;
  viewerId?: number;
  after?: string;
}

/* Only the request-independent first page is shareable. Canonicalizing both
   dimensions keeps the dynamic cache key finite and prevents raw query input
   from becoming an unbounded key. */
export function publicFeedCacheScope(
  input: PublicFeedScopeInput,
): PublicFeedCacheScope | null {
  if (
    input.viewerId !== undefined ||
    input.subscriberId !== undefined ||
    input.after !== undefined
  ) {
    return null;
  }
  const category = CATEGORIES.find((item) => item.id === input.category)?.id ?? null;
  return {
    sort: input.sort === "new" ? "new" : "hot",
    category,
  };
}

export interface PublicFeedPostDto {
  id: number;
  type: string;
  category: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  visibility: "public";
  hiddenAt: null;
  hiddenReason: null;
  score: number;
  commentCount: number;
  createdAt: string;
  handle: string;
  name: string;
  avatarUrl: string;
  role: string;
  aiReply: boolean;
}

export interface PublicFeedPageDto {
  posts: PublicFeedPostDto[];
  nextCursor: string | null;
}

function publicPostDto(post: FeedPost): PublicFeedPostDto | null {
  /* Defense in depth: the SQL is already anonymous/public-only, but a future
     query refactor still cannot serialize a private or moderated card. */
  if (post.visibility !== "public" || post.hiddenAt !== null) return null;
  return {
    id: post.id,
    type: post.type,
    category: post.category,
    title: post.title,
    excerpt: post.excerpt,
    bodyMd: post.bodyMd,
    visibility: "public",
    hiddenAt: null,
    hiddenReason: null,
    score: post.score,
    commentCount: post.commentCount,
    createdAt: post.createdAt.toISOString(),
    handle: post.handle,
    name: post.name,
    avatarUrl: post.avatarUrl,
    role: post.role,
    aiReply: post.aiReply,
  };
}

export function toPublicFeedPageDto(page: FeedPage): PublicFeedPageDto {
  const posts: PublicFeedPostDto[] = [];
  for (const post of page.posts) {
    const dto = publicPostDto(post);
    if (dto) posts.push(dto);
  }
  return { posts, nextCursor: page.nextCursor };
}

export function hydratePublicFeedPage(dto: PublicFeedPageDto): FeedPage {
  return {
    posts: dto.posts.map((post) => ({
      ...post,
      createdAt: new Date(post.createdAt),
    })),
    nextCursor: dto.nextCursor,
  };
}
