/* Yearly build-footprint grid (pure functions, no db — shared by client
   components, server pages, and unit tests). Shape mirrors the GitHub
   contribution graph: 53 columns x 7 rows, Monday as the first row of each
   week (same convention as the heatmap's WEEKDAY()). The data window is the
   user's local today minus 370 days (371 days = 53 x 7); the last column is
   anchored to the week containing today (last cell of the last column =
   this Sunday; today always sits in the last column). The first column
   starts at the Monday on or after the window's first day, so the earliest
   0-6 days of the window may fall outside the grid on the left (not
   rendered). Days after today in the last column get inWindow=false and
   render at the lightest shade with no hover text. */
export const FOOTPRINT_WEEKS = 53;
export const FOOTPRINT_DAYS = 371; // 53 × 7

const DAY_MS = 86400000;

export interface FootprintCell {
  /* YYYY-MM-DD (user-local date) */
  date: string;
  tokens: number;
  inWindow: boolean;
}

export interface FootprintGrid {
  /* weeks[col][row], 53 x 7, row 0 = Monday */
  weeks: FootprintCell[][];
  /* Month labels: the Monday of column weekIndex enters a new month (1-12);
     the label sits above that column. */
  monthLabels: { weekIndex: number; month: number }[];
}

function parseYmd(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function toYmd(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/* Same tz clamp as social.ts / filters.ts ([-720, 840], invalid falls to 0). */
function clampTz(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(840, Math.max(-720, Math.trunc(parsed)));
}

/* The calendar day (YYYY-MM-DD) of "now" in the user's timezone;
   tzOffsetMinutes = local - UTC. */
export function localTodayYmd(
  tzOffsetMinutes: number,
  now: Date = new Date(),
): string {
  return toYmd(now.getTime() + clampTz(tzOffsetMinutes) * 60000);
}

/* Day aggregate (YYYY-MM-DD -> tokens) + local today -> the 53x7 grid.
   The grid's last day is the Sunday of today's week; days outside the
   window (before the first column / after today) get inWindow=false.
   Out-of-window keys in days are ignored; missing keys count as 0. */
export function buildYearGrid(
  days: Record<string, number>,
  today: string,
): FootprintGrid {
  const todayMs = parseYmd(today);
  const windowStartMs = todayMs - (FOOTPRINT_DAYS - 1) * DAY_MS;
  /* Sunday of today's week = grid end; getUTCDay() Sunday=0, so (day+6)%7
     under Monday=0. */
  const todayWeekday = (new Date(todayMs).getUTCDay() + 6) % 7;
  const gridEndMs = todayMs + (6 - todayWeekday) * DAY_MS;
  const gridStartMs = gridEndMs - (FOOTPRINT_DAYS - 1) * DAY_MS;

  const weeks: FootprintCell[][] = [];
  for (let w = 0; w < FOOTPRINT_WEEKS; w++) {
    const week: FootprintCell[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = gridStartMs + (w * 7 + d) * DAY_MS;
      const inWindow = ms >= windowStartMs && ms <= todayMs;
      const raw = inWindow ? Number(days[toYmd(ms)]) : 0;
      week.push({
        date: toYmd(ms),
        tokens: Number.isFinite(raw) && raw > 0 ? raw : 0,
        inWindow,
      });
    }
    weeks.push(week);
  }

  const monthLabels: FootprintGrid["monthLabels"] = [];
  for (let w = 1; w < FOOTPRINT_WEEKS; w++) {
    const prev = new Date(parseYmd(weeks[w - 1][0].date)).getUTCMonth();
    const cur = new Date(parseYmd(weeks[w][0].date)).getUTCMonth();
    if (cur !== prev) monthLabels.push({ weekIndex: w, month: cur + 1 });
  }
  return { weeks, monthLabels };
}

/* ---- Month label copy + placement (render helpers, pure). ---- */

const MONTH_SHORT_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* Compact month label above the grid: zh is the month digit plus the
   CJK month glyph, en is the three-letter short form ("Sep", "Dec").
   Every label is at most 4 glyphs — the placement budget below relies
   on that. */
export function footprintMonthText(month: number, zh: boolean): string {
  return zh ? `${month}月` : MONTH_SHORT_EN[month - 1] ?? "";
}

/* Labels anchor at their column's left edge by percentage. Within the
   final two columns the space to the right is narrower than any month
   label, so the absolutely-positioned span would wrap its two glyphs
   onto two lines or overflow the grid — those labels right-align
   instead (translateX(-100%)): the text ends at the anchor and stays
   inside the grid. Same rule for the desktop 53-week grid and each
   mobile half-year page (placement always sees the page's own week
   count). */
export const MONTH_LABEL_EDGE_WEEKS = 2;

export function monthLabelRightAligns(
  weekIndex: number,
  totalWeeks: number,
): boolean {
  return (
    Number.isFinite(weekIndex) &&
    Number.isFinite(totalWeeks) &&
    totalWeeks > 0 &&
    weekIndex >= totalWeeks - MONTH_LABEL_EDGE_WEEKS
  );
}

/* ---- Footprint summary: last-year total / active days / daily peak /
   streaks. Streak definition matches share.ts dailyStreak: if the latest
   active day is older than yesterday, current is 0 — producing nothing
   today yet does not break a streak. */

export interface FootprintSummary {
  totalTokens: number;
  activeDays: number;
  peakTokens: number;
  peakDay: string | null;
  streak: { current: number; longest: number };
}

export function footprintSummary(
  days: Record<string, number>,
  today: string,
): FootprintSummary {
  const active = Object.entries(days)
    .filter(([, tokens]) => tokens > 0)
    .map(([day]) => day)
    .sort();
  let totalTokens = 0;
  let peakTokens = 0;
  let peakDay: string | null = null;
  for (const [day, tokens] of Object.entries(days)) {
    if (tokens <= 0) continue;
    totalTokens += tokens;
    if (tokens > peakTokens) {
      peakTokens = tokens;
      peakDay = day;
    }
  }

  const nextDay = (day: string) => toYmd(parseYmd(day) + DAY_MS);
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of active) {
    run = previous && nextDay(previous) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const latest = active.at(-1);
  /* Latest earlier than yesterday (no active day after toYmd(today-1d))
     -> current streak resets to 0 */
  const yesterday = toYmd(parseYmd(today) - DAY_MS);
  let current = 0;
  if (latest && latest >= yesterday) {
    current = 1;
    for (let index = active.length - 2; index >= 0; index -= 1) {
      if (nextDay(active[index]) !== active[index + 1]) break;
      current += 1;
    }
  }
  return {
    totalTokens,
    activeDays: active.length,
    peakTokens,
    peakDay,
    streak: { current, longest },
  };
}
