/* Public data-cache tags live in a dependency-free module so mutation paths can
   invalidate them without importing the cached query (or its database graph). */
export const PUBLIC_POSTS_CACHE_TAG = "public:posts";
export const PUBLIC_WORKS_CACHE_TAG = "public:works";
export const PUBLIC_USERS_CACHE_TAG = "public:users";
export const PUBLIC_FEATURED_CACHE_TAG = "public:featured";
export const PUBLIC_USAGE_LEADERBOARD_CACHE_TAG = "public:usage-leaderboard";
/* 月刊 L1 统计快照(20260822 P2-5):四路聚合(DB 计数 + 30 天用量窗口),
   5 分钟兜底 TTL;文章发布/撤稿时由 blog actions 主动失效 */
export const PUBLIC_MONTHLY_STATS_CACHE_TAG = "public:monthly-stats";
