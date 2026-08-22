/* 月刊 L1 统计快照的数据缓存(20260822 P2-5)。
   getMonthlyStatsSnapshot 是四路聚合(社区统计/作品数/token 累计/30 天用量
   窗口),每个月刊详情请求都重算一遍太贵;快照语义允许分钟级陈旧。
   与 public-feed-cache / public-works-cache 同一模式:缓存模块独立成文件,
   monthly.ts 保持纯模块可被单测直接导入(unstable_cache 在 Next 运行时
   之外调用会抛 invariant)。文章发布/撤稿时由 blog actions 作废本 tag。 */
import { unstable_cache } from "next/cache";
import { PUBLIC_MONTHLY_STATS_CACHE_TAG } from "./cache-tags";
import { getMonthlyStatsSnapshot } from "./monthly";

/* 兜底 TTL:token/计数持续流入,即便没人发布也最多陈旧 5 分钟 */
export const MONTHLY_STATS_REVALIDATE_SECONDS = 5 * 60;

export const getCachedMonthlyStatsSnapshot = unstable_cache(
  getMonthlyStatsSnapshot,
  ["monthly-stats-snapshot-v1"],
  {
    revalidate: MONTHLY_STATS_REVALIDATE_SECONDS,
    tags: [PUBLIC_MONTHLY_STATS_CACHE_TAG],
  },
);
