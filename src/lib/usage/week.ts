/* 热图「单周」模式的周计算:以用户自报时区(tzOffsetMinutes)为准的自然周
   (周一 00:00 → 下周一 00:00),ISO-8601 周数。计算在「本地平移毫秒」空间
   完成(localMs = utcMs + tz),不依赖服务器时区。 */

export interface WeekWindow {
  fromUtcMs: number;
  toUtcMs: number;
}

/* 所在周周一 00:00 的本地平移毫秒。 */
function mondayLocalMs(instantMs: number, tzMs: number): number {
  const localMs = instantMs + tzMs;
  const dayStartMs = Math.floor(localMs / 86_400_000) * 86_400_000;
  const weekday = (new Date(dayStartMs).getUTCDay() + 6) % 7;
  return dayStartMs - weekday * 86_400_000;
}

/* 某时刻所在自然周的 UTC 边界 [from, to)。 */
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
  // 1 月 4 日必在 ISO 第 1 周;round 吸收任何 DST 小时差。
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

/* heatweek 查询参数值:用户时区里周一的本地日期(YYYY-MM-DD)。 */
export function weekKeyFor(weekFromUtcMs: number, tzOffsetMinutes: number): string {
  return new Date(weekFromUtcMs + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/* 解析 heatweek 参数;任意合法日期吸附到所在周周一,非法返回 null。 */
export function parseWeekKey(value: unknown, tzOffsetMinutes: number): WeekWindow | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const localMs = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(localMs)) return null;
  return weekWindowFor(localMs - tzOffsetMinutes * 60_000, tzOffsetMinutes);
}
