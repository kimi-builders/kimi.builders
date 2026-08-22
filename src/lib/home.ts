/* Home page data assembly: community stats + site-wide token total + this
   week's featured (falling back to 7-day hot when empty). Query-level
   ISR: the home page carries AuthChip (cookies, per-request dynamic), so
   route-level ISR is impossible — the cache sits at the query layer
   instead (unstable_cache, revalidate 300), one shared copy site-wide;
   the feature/unfeature server actions updateTag(HOME_CACHE_TAG) for
   instant invalidation so admin actions show up immediately. The poster
   body itself stays static markup. */
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

/* featuredAt never enters the home payload (not rendered, and Date
   serializes to a string through the cache — omitted on purpose). */
export type HomeFeaturedItem = Omit<FeaturedItem, "featuredAt">;

export interface HomeData {
  stats: CommunityStats & { tokens: number };
  featured: HomeFeaturedItem[];
  /* Fallback when nothing is featured: 7-day hot; both empty -> the
     section never renders (no empty shells during cold start). */
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
      /* featuredAt never enters the home payload (not rendered; Date
         serializes to a string through the cache — omitted on purpose). */
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
