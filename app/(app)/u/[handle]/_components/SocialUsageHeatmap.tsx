"use client";

/* 个人主页「用量」页签的分时热图(S2-2):星期×本地小时 7×24 网格,只看 token。
   视觉/交互对齐用量看板的 UsageHeatmapGrid(同一套色阶、行列标签、悬停 tooltip、
   TOP5 摘要),但刻意简化:不含估费/活跃时长/消息数 —— 那些依赖看板的定价与
   会话管线,社交面只公开 token 总量这一个聚合数字。
   可见性门禁在页面侧(仅本人或对方 show_on_leaderboard=1 时才渲染本组件)。 */
import { useState } from "react";

const WEEKDAY_LONG_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAY_LONG_EN = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

/* 与用量看板 page.tsx 的 gmtLabel 同款:tzOffsetMinutes = 本地 − UTC 的分钟数。 */
function gmtLabel(tzOffsetMinutes: number): string {
  const sign = tzOffsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

export default function SocialUsageHeatmap({
  grid,
  tzOffsetMinutes,
  zh,
}: {
  /* 7(周一起)× 24(本地小时)的 token 总量 */
  grid: number[][];
  tzOffsetMinutes: number;
  zh: boolean;
}) {
  const [hovered, setHovered] = useState<{ weekday: number; hour: number } | null>(null);
  const max = Math.max(0, ...grid.flat());
  const longNames = zh ? WEEKDAY_LONG_ZH : WEEKDAY_LONG_EN;
  const weekdayLabelWidth = zh ? "w-8" : "w-14";
  /* 与用量中心 UsageHeatmapGrid 同一套 6 档阈值 */
  const stepClass = (value: number): string => {
    if (value <= 0 || max <= 0) return "bg-paper/[0.05]";
    const ratio = value / max;
    if (ratio <= 0.16) return "bg-blue/15";
    if (ratio <= 0.32) return "bg-blue/30";
    if (ratio <= 0.48) return "bg-blue/45";
    if (ratio <= 0.64) return "bg-blue/60";
    if (ratio <= 0.82) return "bg-blue/80";
    return "bg-blue";
  };
  const top = grid
    .flatMap((row, weekday) => row.map((value, hour) => ({ weekday, hour, value })))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="relative" onMouseLeave={() => setHovered(null)}>
      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,620px)_minmax(220px,1fr)]">
        <div className="relative min-w-0">
          {/* 完整星期文案需要比单字标签更宽;窄屏允许横向滚动,保持 24 小时格子可读。 */}
          <div className="scrollbar-none overflow-x-auto pb-1">
            <div className="min-w-[580px] max-w-[620px]">
              <div className="flex items-center gap-1.5">
                <span className={`${weekdayLabelWidth} shrink-0`} />
                <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span key={hour} className="text-center font-mono text-[9px] text-grey">
                      {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-1 space-y-[3px]">
                {grid.map((row, weekday) => (
                  <div key={weekday} className="flex items-center gap-1.5">
                    <span
                      className={`${weekdayLabelWidth} shrink-0 text-left font-mono text-[10px] text-grey`}
                    >
                      {longNames[weekday]}
                    </span>
                    <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
                      {row.map((value, hour) => (
                        <button
                          key={hour}
                          type="button"
                          aria-label={`${longNames[weekday]} ${String(hour).padStart(2, "0")}:00 · ${compact(value)} tokens`}
                          className={`aspect-square rounded-[3px] transition-transform hover:z-10 hover:scale-125 focus:outline focus:outline-1 focus:outline-blue ${stepClass(value)}`}
                          onMouseEnter={() => setHovered({ weekday, hour })}
                          onFocus={() => setHovered({ weekday, hour })}
                          onBlur={() => setHovered(null)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {hovered && (
            <div
              role="tooltip"
              className="pointer-events-none absolute right-1 top-5 z-20 rounded-lg border border-line bg-moon p-3 shadow-2xl"
            >
              <div className="font-mono text-[11px] font-semibold text-paper">
                {longNames[hovered.weekday]} {String(hovered.hour).padStart(2, "0")}:00
              </div>
              <div className="mt-1 font-mono text-[11px] text-paper">
                {compact(grid[hovered.weekday][hovered.hour])} tokens
              </div>
            </div>
          )}

          <p className="mt-3 font-mono text-[10px] text-grey">
            {zh
              ? `时区:${gmtLabel(tzOffsetMinutes)}(浏览器本地)· 全部时间的 token 分布`
              : `Timezone: ${gmtLabel(tzOffsetMinutes)} (browser local) · all-time token distribution`}
          </p>
        </div>

        <aside
          aria-label={zh ? "最活跃时段" : "Busiest slots"}
          className="rounded-xl border border-line bg-paper/[0.025] p-4"
        >
          <p className="font-mono text-[11px] font-semibold text-paper">
            {zh ? "最活跃时段" : "Busiest slots"}
          </p>
          <p className="mt-1 font-mono text-[9px] tracking-[0.14em] text-grey/70">TOKEN TOP 5</p>
          {top.length === 0 ? (
            <p className="mt-5 text-[10px] text-grey">
              {zh ? "还没有用量数据" : "No usage data yet"}
            </p>
          ) : (
            <ol className="mt-4 space-y-2">
              {top.map((item, index) => (
                <li
                  key={`${item.weekday}-${item.hour}`}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-line/70 pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="font-mono text-[10px] text-blue">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2 font-mono text-[10px]">
                      <span className="truncate text-paper">
                        {longNames[item.weekday]} {String(item.hour).padStart(2, "0")}:00
                      </span>
                      <span className="shrink-0 text-grey">{compact(item.value)}</span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[9px] text-grey/65">tokens</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
