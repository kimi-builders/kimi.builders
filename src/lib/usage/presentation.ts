export type UsageDashboardViewState = "first-run" | "empty-range" | "ready";

export const USAGE_STALE_AFTER_HOURS = 24;

/* 显式把 instant 移到看板固定偏移后再按 UTC 格式化，避免服务端 UTC 与
   浏览器本地时区不同引发 hydration 文本不一致。 */
export function formatUsageLocalDateTime(
  iso: string,
  locale: string,
  tzOffsetMinutes: number,
): string {
  const shifted = new Date(new Date(iso).getTime() + tzOffsetMinutes * 60_000);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(shifted);
}

/* 展示状态只依赖服务端事实：lastSyncAt 是跨全部历史的 ingest 时间，
   因此不会把“当前范围没数据”误判成从未使用。 */
export function usageDashboardViewState(input: {
  lastSyncAt: Date | string | null;
  totalTokens: number;
  requests: number;
  sessions: number;
}): UsageDashboardViewState {
  if (input.lastSyncAt === null) return "first-run";
  if (input.totalTokens === 0 && input.requests === 0 && input.sessions === 0) {
    return "empty-range";
  }
  return "ready";
}
