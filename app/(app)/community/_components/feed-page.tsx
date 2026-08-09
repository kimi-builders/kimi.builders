/* feed 一页的服务端组装:游标分页查询 + 顶/踩态(一条 IN 批量查,避免 N+1)
   + 卡片渲染。社区页首屏(SSR)与「加载更多」server action 共用,
   保证两种入口输出一致(同 comment-page.tsx 的模式)。 */
import type { ReactNode } from "react";
import type { Locale } from "@/src/lib/i18n";
import { getFeedPage, getPostReactions } from "@/src/lib/posts";
import PostCard from "./PostCard";

export interface FeedPageData {
  nodes: ReactNode[];
  nextCursor: string | null;
}

export async function loadFeedCards(
  opts: {
    sort: "hot" | "new";
    category?: string;
    subscriberId?: number;
    viewerId?: number;
    after?: string;
  },
  locale: Locale,
): Promise<FeedPageData> {
  const page = await getFeedPage(opts);
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
