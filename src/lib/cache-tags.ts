/* Public data-cache tags live in a dependency-free module so mutation paths can
   invalidate them without importing the cached query (or its database graph). */
export const PUBLIC_POSTS_CACHE_TAG = "public:posts";
export const PUBLIC_WORKS_CACHE_TAG = "public:works";
export const PUBLIC_USERS_CACHE_TAG = "public:users";
export const PUBLIC_FEATURED_CACHE_TAG = "public:featured";
export const PUBLIC_USAGE_LEADERBOARD_CACHE_TAG = "public:usage-leaderboard";
