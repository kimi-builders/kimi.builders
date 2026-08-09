/* 分享海报的客户端安全契约。不得从这里引入数据库、认证或 Next 服务端模块。 */
export const USAGE_SHARE_RANGES = ["today", "24h", "7d", "30d", "90d", "all"] as const;

export type UsageShareRange = (typeof USAGE_SHARE_RANGES)[number];

