/* 首页数据组装:社区统计 + 全站 token 累计 + 本周精选(空则回落 7 日热门)。
   数据层 ISR:首页海报带 AuthChip(cookies,按请求动态),路由级 ISR 不成立,
   所以缓存打在查询层 —— unstable_cache(revalidate 300),全站共享一份,
   精选/取消精选的 server action 里 updateTag(HOME_CACHE_TAG) 即时作废,
   保证「管理员操作后首页即时可见」(1.3 验收)。海报主体仍是静态标记。 */
import { unstable_cache } from "next/cache";
import { getFeaturedFeed, type FeaturedItem } from "./featured";
import {
  getCommunityStats,
  getHotPosts,
  type CommunityStats,
  type HotPost,
} from "./posts";
import { getCommunityTokenTotal } from "./usage/community";

export const HOME_CACHE_TAG = "home";

/* featuredAt 不进首页载荷(渲染不展示,且 Date 过缓存会序列化成串,干脆不带)。 */
export type HomeFeaturedItem = Omit<FeaturedItem, "featuredAt">;

export interface HomeData {
  stats: CommunityStats & { tokens: number };
  featured: HomeFeaturedItem[];
  /* 无任何精选时的回落:7 日热门;两者皆空 → 首页不渲染该区块(冷启动不出空壳) */
  hot: HotPost[];
}

async function loadHomeData(): Promise<HomeData> {
  const [stats, tokens, featured] = await Promise.all([
    getCommunityStats(),
    getCommunityTokenTotal(),
    getFeaturedFeed(4),
  ]);
  const hot = featured.length === 0 ? await getHotPosts(5) : [];
  return {
    stats: { ...stats, tokens },
    featured: featured.map((f) => {
      /* featuredAt 不进首页载荷(渲染不展示;Date 过缓存会序列化成串,干脆不带) */
      const { featuredAt, ...rest } = f;
      void featuredAt;
      return rest;
    }),
    hot,
  };
}

export const getHomeData = unstable_cache(loadHomeData, ["home-data"], {
  revalidate: 300,
  tags: [HOME_CACHE_TAG],
});
