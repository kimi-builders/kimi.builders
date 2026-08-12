/* Shared caches for anonymous public right-rail aggregates. Cache Components
   are disabled in this app, so these remain on unstable_cache. Each callback
   is request-independent and returns only a JSON DTO. */
import { unstable_cache } from "next/cache";
import {
  PUBLIC_FEATURED_CACHE_TAG,
  PUBLIC_POSTS_CACHE_TAG,
  PUBLIC_USERS_CACHE_TAG,
  PUBLIC_WORKS_CACHE_TAG,
} from "./cache-tags";
import { getFeaturedFeed } from "./featured";
import { getSidebarData } from "./posts";
import {
  toPublicAwesomeRailDto,
  toPublicCommunitySidebarDto,
  toPublicFeaturedRailDto,
  toPublicWorksRailDto,
} from "./public-rails";
import {
  getAwesomeScopeStats,
  getAwesomeStats,
  getTopWorks,
  getWorksAgentStats,
  getWorksKindStats,
  getWorksWallStats,
} from "./works";

export const PUBLIC_COMMUNITY_RAIL_REVALIDATE_SECONDS = 120;
export const PUBLIC_FEATURED_RAIL_REVALIDATE_SECONDS = 300;
export const PUBLIC_WORKS_RAIL_REVALIDATE_SECONDS = 120;

export const getPublicCommunitySidebar = unstable_cache(
  async () => toPublicCommunitySidebarDto(await getSidebarData()),
  ["community-sidebar-public-v1"],
  {
    revalidate: PUBLIC_COMMUNITY_RAIL_REVALIDATE_SECONDS,
    tags: [PUBLIC_POSTS_CACHE_TAG, PUBLIC_USERS_CACHE_TAG],
  },
);

export const getPublicFeaturedRail = unstable_cache(
  async () => toPublicFeaturedRailDto(await getFeaturedFeed(3)),
  ["featured-right-rail-public-v1"],
  {
    revalidate: PUBLIC_FEATURED_RAIL_REVALIDATE_SECONDS,
    tags: [PUBLIC_FEATURED_CACHE_TAG, PUBLIC_USERS_CACHE_TAG],
  },
);

export const getPublicWorksRail = unstable_cache(
  async () => {
    const [stats, agents, kinds, top] = await Promise.all([
      getWorksWallStats(),
      getWorksAgentStats("site", 6),
      getWorksKindStats("site"),
      getTopWorks(5),
    ]);
    return toPublicWorksRailDto({ stats, agents, kinds, top });
  },
  ["works-right-rail-public-v1"],
  {
    revalidate: PUBLIC_WORKS_RAIL_REVALIDATE_SECONDS,
    tags: [PUBLIC_WORKS_CACHE_TAG],
  },
);

export const getPublicAwesomeRail = unstable_cache(
  async () => {
    const [stats, scopeStats, agents] = await Promise.all([
      getAwesomeStats(),
      getAwesomeScopeStats(),
      getWorksAgentStats("awesome", 6),
    ]);
    return toPublicAwesomeRailDto({ stats, scopeStats, agents });
  },
  ["awesome-right-rail-public-v1"],
  {
    revalidate: PUBLIC_WORKS_RAIL_REVALIDATE_SECONDS,
    tags: [PUBLIC_WORKS_CACHE_TAG],
  },
);
