"use client";

/* 个人主页「用量」页签的分时热图(S2-2):星期×本地小时 7×24 网格,只看 token。
   视觉/交互对齐用量看板的 UsageHeatmapGrid(同一套色阶、行列标签、悬停 tooltip、
   TOP5 折叠),但刻意简化:不含估费/活跃时长/消息数 —— 那些依赖看板的定价与
   会话管线,社交面只公开 token 总量这一个聚合数字。
   可见性门禁在页面侧(仅本人或对方 show_on_leaderboard=1 时才渲染本组件)。 */
import { useState } from "react";

const WEEKDAY_LONG_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEKDAY_LONG_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_SHORT_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_SHORT_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

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
  const shortNames = zh ? WEEKDAY_SHORT_ZH : WEEKDAY_SHORT_EN;
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
      {/* 格子随列宽自适应,但设最大宽度:超宽容器里格子不再被拉成 chunky 大块,
          与用量中心热图保持同一视觉密度。 */}
      <div className="pb-1">
        <div className="max-w-[620px]">
          <div className="flex items-center gap-1.5">
            <span className="w-5 shrink-0" />
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
                <span className="w-5 shrink-0 text-center font-mono text-[10px] text-grey">
                  {shortNames[weekday]}
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
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 font-mono text-[11px] text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
          {zh ? "最活跃时段(TOP 5)" : "BUSIEST SLOTS (TOP 5)"}
        </summary>
        {top.length === 0 ? (
          <p className="mt-2 text-[10px] text-grey">
            {zh ? "还没有用量数据" : "No usage data yet"}
          </p>
        ) : (
          <ol className="mt-2 space-y-1 font-mono text-[10px] text-grey">
            {top.map((item) => (
              <li key={`${item.weekday}-${item.hour}`}>
                {longNames[item.weekday]} {String(item.hour).padStart(2, "0")}:00 —{" "}
                {compact(item.value)} tokens
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
