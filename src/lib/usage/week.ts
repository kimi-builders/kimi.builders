/* Week math for the heatmap's single-week mode: natural weeks (Mon 00:00 to
   next Mon 00:00) in the user's self-reported timezone (tzOffsetMinutes),
   ISO-8601 week numbers. All math happens in locally shifted milliseconds
   (localMs = utcMs + tz), independent of the server timezone. */

export interface WeekWindow {
  fromUtcMs: number;
  toUtcMs: number;
}

/* Monday 00:00 of the containing week, in locally shifted milliseconds. */
function mondayLocalMs(instantMs: number, tzMs: number): number {
  const localMs = instantMs + tzMs;
  const dayStartMs = Math.floor(localMs / 86_400_000) * 86_400_000;
  const weekday = (new Date(dayStartMs).getUTCDay() + 6) % 7;
  return dayStartMs - weekday * 86_400_000;
}

/* UTC boundaries [from, to) of the natural week containing the instant. */
export function weekWindowFor(instantMs: number, tzOffsetMinutes: number): WeekWindow {
  const tzMs = tzOffsetMinutes * 60_000;
  const mondayLocal = mondayLocalMs(instantMs, tzMs);
  return { fromUtcMs: mondayLocal - tzMs, toUtcMs: mondayLocal + 7 * 86_400_000 - tzMs };
}

export function isoWeekNumberTz(weekFromUtcMs: number, tzOffsetMinutes: number): number {
  const tzMs = tzOffsetMinutes * 60_000;
  const mondayLocal = weekFromUtcMs + tzMs;
  const thursdayLocal = mondayLocal + 3 * 86_400_000;
  const isoYear = new Date(thursdayLocal).getUTCFullYear();
  // Jan 4 always falls in ISO week 1; rounding absorbs any DST hour drift.
  const week1MondayLocal = mondayLocalMs(Date.UTC(isoYear, 0, 4), 0);
  return Math.round((mondayLocal - week1MondayLocal) / (7 * 86_400_000)) + 1;
}

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekLabel(weekFromUtcMs: number, tzOffsetMinutes: number, zh: boolean): string {
  const tzMs = tzOffsetMinutes * 60_000;
  const start = new Date(weekFromUtcMs + tzMs);
  const end = new Date(weekFromUtcMs + 6 * 86_400_000 + tzMs);
  const week = isoWeekNumberTz(weekFromUtcMs, tzOffsetMinutes);
  const month = start.getUTCMonth() + 1;
  const day = start.getUTCDate();
  const endMonth = end.getUTCMonth() + 1;
  const endDay = end.getUTCDate();
  if (zh) return `第 ${week} 周 · ${month}月${day}日–${endMonth === month ? "" : `${endMonth}月`}${endDay}日`;
  return `Week ${week} · ${EN_MONTHS[month - 1]} ${day}–${endMonth === month ? "" : `${EN_MONTHS[endMonth - 1]} `}${endDay}`;
}

/* heatweek query-param value: the Monday date (YYYY-MM-DD) in the user's timezone. */
export function weekKeyFor(weekFromUtcMs: number, tzOffsetMinutes: number): string {
  return new Date(weekFromUtcMs + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/* Parse the heatweek param; any valid date snaps to its week's Monday, invalid input returns null. */
export function parseWeekKey(value: unknown, tzOffsetMinutes: number): WeekWindow | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const localMs = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(localMs)) return null;
  return weekWindowFor(localMs - tzOffsetMinutes * 60_000, tzOffsetMinutes);
}
