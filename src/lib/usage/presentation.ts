export type UsageDashboardViewState = "first-run" | "empty-range" | "ready";

export const USAGE_STALE_AFTER_HOURS = 24;

/* Format instants at a fixed dashboard offset in UTC so server and browser timezones cannot diverge into hydration mismatches. */
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

/* Presence depends only on server facts: lastSyncAt spans all history, so an empty current range is never mistaken for "never used". */
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
