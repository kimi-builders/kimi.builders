"use client";

/* 个人主页年度构建足迹(S2-3):GitHub 风格 53 列 × 7 行每日 token 贡献图。
   网格/月份标签由 year-grid.ts 在服务端组好,本组件只负责渲染:
   方块固定 10px + 3px 细间隙,窄屏横向滚动不压形;色阶复用分时热图那套
   蓝色透明度阶梯(bg-card 为最浅);悬停用原生 title 显示日期 + 当天 tokens。
   可见性门禁在页面侧(仅本人或对方 show_on_leaderboard=1 时才渲染本组件)。 */
import type { FootprintCell, FootprintGrid } from "@/src/lib/usage/year-grid";
import { compactNumber } from "@/src/lib/format";

const CELL = 10; // px
const GAP = 3; // px

const MONTH_SHORT_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function YearFootprint({
  grid,
  zh,
}: {
  grid: FootprintGrid;
  zh: boolean;
}) {
  const max = Math.max(
    0,
    ...grid.weeks.flat().map((c) => (c.inWindow ? c.tokens : 0)),
  );
  /* 与 SocialUsageHeatmap 同一套蓝阶梯阈值 */
  const stepClass = (cell: FootprintCell): string => {
    if (!cell.inWindow || cell.tokens <= 0 || max <= 0) return "bg-card";
    const ratio = cell.tokens / max;
    if (ratio <= 0.25) return "bg-blue/25";
    if (ratio <= 0.45) return "bg-blue/45";
    if (ratio <= 0.65) return "bg-blue/65";
    if (ratio <= 0.85) return "bg-blue/85";
    return "bg-blue";
  };
  const monthText = (month: number) =>
    zh ? `${month}月` : MONTH_SHORT_EN[month - 1];
  const cellTitle = (cell: FootprintCell): string | undefined =>
    cell.inWindow
      ? `${cell.date} · ${compactNumber(cell.tokens, zh ? "zh" : "en")} tokens`
      : undefined;

  return (
    <div className="overflow-x-auto pb-1">
      <div className="w-max">
        {/* 月份标签:按列距绝对定位,随网格一起横滚 */}
        <div className="relative h-4">
          {grid.monthLabels.map((m) => (
            <span
              key={`${m.weekIndex}-${m.month}`}
              className="absolute top-0 font-mono text-[9px] text-grey"
              style={{ left: m.weekIndex * (CELL + GAP) }}
            >
              {monthText(m.month)}
            </span>
          ))}
        </div>
        <div
          className="mt-1 grid grid-flow-col grid-rows-7"
          style={{ gap: GAP }}
        >
          {grid.weeks.flat().map((cell) => (
            <div
              key={cell.date}
              title={cellTitle(cell)}
              aria-label={cellTitle(cell)}
              className={`${stepClass(cell)} transition-transform hover:scale-125`}
              style={{ width: CELL, height: CELL }}
            />
          ))}
        </div>
        {/* 图例:少 → 多 */}
        <div className="mt-2 flex items-center justify-end gap-1 font-mono text-[9px] text-grey">
          <span>{zh ? "少" : "Less"}</span>
          {["bg-card", "bg-blue/25", "bg-blue/45", "bg-blue/65", "bg-blue/85", "bg-blue"].map(
            (cls) => (
              <span
                key={cls}
                className={cls}
                style={{ width: CELL, height: CELL }}
              />
            ),
          )}
          <span>{zh ? "多" : "More"}</span>
        </div>
      </div>
    </div>
  );
}
