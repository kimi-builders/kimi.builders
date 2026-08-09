/* 年度构建足迹网格(纯函数,无 db 依赖 —— client 组件 / server 页面 / 单测共用)。
   形态对齐 GitHub 贡献图:53 列 × 7 行,周一为每周首行(与分时热图 WEEKDAY() 同口径)。
   数据窗口 = 用户本地今天往前 370 天(共 371 天 = 53 × 7);网格末列锚定「今天所在周」
   (末列末行 = 本周日,今天恒在末列内)。网格首列起点 = 窗口首日当天或其后最近的周一,
   即窗口最早的 0–6 天可能落在网格左侧之外(不显示);末列今天之后的未来天数
   标 inWindow=false,渲染最浅色且无悬停文字。 */
export const FOOTPRINT_WEEKS = 53;
export const FOOTPRINT_DAYS = 371; // 53 × 7

const DAY_MS = 86400000;

export interface FootprintCell {
  /* YYYY-MM-DD(用户本地日期) */
  date: string;
  tokens: number;
  inWindow: boolean;
}

export interface FootprintGrid {
  /* weeks[列][行],53 × 7,行 0 = 周一 */
  weeks: FootprintCell[][];
  /* 月份标签:第 weekIndex 列的周一进入了新的月份(1-12),标签贴在该列上方 */
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

/* 与 social.ts / filters.ts 同一套时区夹取([-720, 840],非法值落 0)。 */
function clampTz(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(840, Math.max(-720, Math.trunc(parsed)));
}

/* 「现在」在用户时区里的日历日(YYYY-MM-DD);tzOffsetMinutes = 本地 − UTC。 */
export function localTodayYmd(
  tzOffsetMinutes: number,
  now: Date = new Date(),
): string {
  return toYmd(now.getTime() + clampTz(tzOffsetMinutes) * 60000);
}

/* 日聚合(YYYY-MM-DD → tokens)+ 本地今天 → 53×7 网格。
   网格末日 = 今天所在周的周日;窗口外(首列之前 / 今天之后)的天数 inWindow=false。
   days 里窗口外的键忽略,缺失的键按 0。 */
export function buildYearGrid(
  days: Record<string, number>,
  today: string,
): FootprintGrid {
  const todayMs = parseYmd(today);
  const windowStartMs = todayMs - (FOOTPRINT_DAYS - 1) * DAY_MS;
  /* 今天所在周的周日 = 网格末日;getUTCDay() 周日=0 → 周一=0 口径下 (day+6)%7 */
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
