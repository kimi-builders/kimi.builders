"use client";

/* 个人主页「用量」页签的分时热图(S2-2):星期×本地小时 7×24 网格,只看 token。
   视觉/交互对齐用量看板的 UsageHeatmapGrid(同一套色阶、行列标签、悬停 tooltip、
   TOP5 摘要),但刻意简化:不含估费/活跃时长/消息数 —— 那些依赖看板的定价与
   会话管线,社交面只公开 token 总量这一个聚合数字。
   可见性门禁在页面侧(仅本人或对方 show_on_leaderboard=1 时才渲染本组件)。 */
import { useState } from "react";
import { compactNumber } from "@/src/lib/format";

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

function compact(value: number, zh: boolean): string {
  return compactNumber(value, zh ? "zh" : "en");
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
  const [mobileHourStart, setMobileHourStart] = useState<0 | 12>(0);
  const max = Math.max(0, ...grid.flat());
  const total = grid.flat().reduce((sum, value) => sum + value, 0);
  const longNames = zh ? WEEKDAY_LONG_ZH : WEEKDAY_LONG_EN;
  const weekdayLabelWidth = zh ? "w-8" : "w-14";
  /* 与用量中心 UsageHeatmapGrid 同一套 6 档阈值 */
  const stepClass = (value: number): string => {
    if (value <= 0 || max <= 0) return "bg-viz-grid";
    const ratio = value / max;
    if (ratio <= 0.2) return "bg-viz-sequential-1";
    if (ratio <= 0.4) return "bg-viz-sequential-2";
    if (ratio <= 0.6) return "bg-viz-sequential-3";
    if (ratio <= 0.8) return "bg-viz-sequential-4";
    return "bg-viz-sequential-5";
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
          <div className="mb-3 grid grid-cols-2 rounded-lg border border-line p-0.5 sm:hidden">
            {([0, 12] as const).map((start) => (
              <button
                key={start}
                type="button"
                aria-pressed={mobileHourStart === start}
                onClick={() => setMobileHourStart(start)}
                className={`min-h-9 rounded-md font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                  mobileHourStart === start ? "bg-viz-blue-primary text-viz-neutral-strong" : "text-grey"
                }`}
              >
                {String(start).padStart(2, "0")}–{String(start + 11).padStart(2, "0")}
              </button>
            ))}
          </div>
          {/* 移动端分为两个 12 小时时段，桌面端保持完整 24 小时矩阵。 */}
          <div className="pb-1">
            <div className="min-w-0 max-w-[620px] sm:min-w-[580px]">
              <div className="flex items-center gap-1.5">
                <span className={`${weekdayLabelWidth} shrink-0`} />
                <div className="grid flex-1 grid-cols-[repeat(12,minmax(0,1fr))] gap-[3px] sm:grid-cols-[repeat(24,minmax(0,1fr))]">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span
                      key={hour}
                      className={`text-center font-mono text-[10.5px] text-grey ${
                        hour >= mobileHourStart && hour < mobileHourStart + 12 ? "" : "hidden sm:block"
                      }`}
                    >
                      {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-1 space-y-[3px]">
                {grid.map((row, weekday) => (
                  <div key={weekday} className="flex items-center gap-1.5">
                    <span
                      className={`${weekdayLabelWidth} shrink-0 text-left font-mono text-[11px] text-grey`}
                    >
                      {longNames[weekday]}
                    </span>
                    <div className="grid flex-1 grid-cols-[repeat(12,minmax(0,1fr))] gap-[3px] sm:grid-cols-[repeat(24,minmax(0,1fr))]">
                      {row.map((value, hour) => {
                        const mobileVisible = hour >= mobileHourStart && hour < mobileHourStart + 12;
                        return (
                          <button
                          key={hour}
                          type="button"
                          aria-label={`${longNames[weekday]} ${String(hour).padStart(2, "0")}:00 · ${compact(value, zh)} tokens`}
                          className={`aspect-square rounded-[3px] transition-transform hover:z-10 hover:scale-125 focus:outline focus:outline-1 focus:outline-blue ${
                            mobileVisible ? "" : "hidden sm:block"
                          } ${stepClass(value)}`}
                          onMouseEnter={() => setHovered({ weekday, hour })}
                          onFocus={() => setHovered({ weekday, hour })}
                          onBlur={() => setHovered(null)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {hovered && (
            <div
              role="tooltip"
              className="pointer-events-none absolute right-1 top-5 z-20 rounded-lg border border-line bg-viz-surface p-3 shadow-2xl"
            >
              <div className="font-mono text-[11px] font-semibold text-paper">
                {longNames[hovered.weekday]} {String(hovered.hour).padStart(2, "0")}:00
              </div>
              <div className="mt-1 font-mono text-[11px] text-paper">
                {compact(grid[hovered.weekday][hovered.hour], zh)} tokens
              </div>
            </div>
          )}

          <p className="mt-3 font-mono text-[11px] text-grey">
            {zh
              ? `时区:${gmtLabel(tzOffsetMinutes)}(浏览器本地)· 全部时间的 token 分布`
              : `Timezone: ${gmtLabel(tzOffsetMinutes)} (browser local) · all-time token distribution`}
          </p>
        </div>

        <aside
          aria-label={zh ? "最活跃时段" : "Busiest slots"}
          className="order-first rounded-xl border border-line bg-paper/[0.025] p-4 lg:order-none"
        >
          <p className="font-mono text-[11px] font-semibold text-paper">
            {zh ? "最活跃时段" : "Busiest slots"}
          </p>
          <p className="mt-1 font-mono text-[10.5px] tracking-[0.14em] text-grey/70">TOKEN TOP 5</p>
          {top.length === 0 ? (
            <p className="mt-5 text-[11px] text-grey">
              {zh ? "还没有用量数据" : "No usage data yet"}
            </p>
          ) : (
            <ol className="mt-4 space-y-2">
              {top.map((item, index) => (
                <li
                  key={`${item.weekday}-${item.hour}`}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-line/70 pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="font-mono text-[11px] text-blue">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
                      <span className="truncate text-paper">
                        {longNames[item.weekday]} {String(item.hour).padStart(2, "0")}:00
                      </span>
                      <span className="shrink-0 text-grey">{compact(item.value, zh)}</span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[10.5px] text-grey/65">
                      tokens · {total > 0 ? `${((item.value / total) * 100).toFixed(1)}%` : "0%"}
                    </span>
                    <span className="mt-1.5 block h-1 bg-viz-grid">
                      <span
                        className={`block h-full ${index === 0 ? "bg-viz-blue-primary" : "bg-viz-neutral-muted"}`}
                        style={{ width: `${Math.max((item.value / Math.max(1, top[0]?.value ?? 1)) * 100, 2)}%` }}
                      />
                    </span>
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
