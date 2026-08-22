/* Client-safe contract for share posters. Never import the database, auth, or Next server modules from here. */
export const USAGE_SHARE_RANGES = ["today", "24h", "7d", "30d", "90d", "all"] as const;

export type UsageShareRange = (typeof USAGE_SHARE_RANGES)[number];

