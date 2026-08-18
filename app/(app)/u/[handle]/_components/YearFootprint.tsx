"use client";

/* 个人主页年度构建足迹:GitHub 风格 53 列 × 7 行每日 token 贡献图。
   网格/月份标签由 year-grid.ts 在服务端组好,本组件只负责渲染:
   - 桌面:通栏 53 列(最大 860px,GitHub 密度);
   - 移动端(sm 以下):拆成前后两个半年页,← → 按钮或左右滑动切换,
     默认落在含当前月的后半年页(格子从 ~5px 回到 ~12px);
   6 档蓝阶与用量中心热图同阈值;悬停/聚焦出角标 tooltip(日期 + 确切 tokens)。
   可见性门禁在页面侧(仅本人或对方 show_on_leaderboard=1 时才渲染本组件)。 */
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { compactNumber } from "@/src/lib/format";
import type {
  FootprintCell,
  FootprintGrid,
  FootprintSummary,
} from "@/src/lib/usage/year-grid";

const MONTH_SHORT_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* 与用量中心 UsageHeatmapGrid 同一套 6 档阈值。 */
const STEPS = [
  "bg-viz-sequential-1",
  "bg-viz-sequential-2",
  "bg-viz-sequential-3",
  "bg-viz-sequential-4",
  "bg-viz-sequential-5",
  "bg-viz-blue-primary",
];

/* 与用量中心同一套紧凑格式(compactNumber:zh 万/亿,en K/M/B,两页读法一致)。 */
function compact(value: number, zh: boolean): string {
  return compactNumber(value, zh ? "zh" : "en");
}

function stepClassOf(cell: FootprintCell, max: number): string {
  if (cell.tokens <= 0 || max <= 0) return "bg-paper/[0.05]";
  const ratio = cell.tokens / max;
  if (ratio <= 0.16) return STEPS[0];
  if (ratio <= 0.32) return STEPS[1];
  if (ratio <= 0.48) return STEPS[2];
  if (ratio <= 0.64) return STEPS[3];
  if (ratio <= 0.82) return STEPS[4];
  return STEPS[5];
}

export default function YearFootprint({
  grid,
  summary,
  zh,
}: {
  grid: FootprintGrid;
  summary: FootprintSummary;
  zh: boolean;
}) {
  const max = Math.max(
    0,
    ...grid.weeks.flat().map((c) => (c.inWindow ? c.tokens : 0)),
  );
  const monthText = (month: number) =>
    zh ? `${month}月` : MONTH_SHORT_EN[month - 1];
  const [hovered, setHovered] = useState<FootprintCell | null>(null);

  /* 移动端分页:53 周拆成 27 + 26 两页,默认后一页(含当前月/今天)。 */
  const PAGE_SPLIT = 27;
  const pages = [grid.weeks.slice(0, PAGE_SPLIT), grid.weeks.slice(PAGE_SPLIT)];
  const [page, setPage] = useState(pages.length - 1);
  const touchStartX = useRef<number | null>(null);

  const cellButton = (cell: FootprintCell) => (
    <button
      key={cell.date}
      type="button"
      aria-label={
        cell.tokens > 0
          ? `${cell.date} · ${compact(cell.tokens, zh)} tokens`
          : `${cell.date} · ${zh ? "未活跃" : "inactive"}`
      }
      className={`aspect-square w-full rounded-[2.5px] transition-transform hover:z-10 hover:scale-[1.35] focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue ${stepClassOf(cell, max)}`}
      onMouseEnter={() => setHovered(cell)}
      onFocus={() => setHovered(cell)}
      onBlur={() => setHovered(null)}
    />
  );

  const renderGrid = (weeks: FootprintCell[][], weekOffset: number) => {
    const monthLabels = grid.monthLabels
      .filter((m) => m.weekIndex >= weekOffset && m.weekIndex < weekOffset + weeks.length)
      .map((m) => ({ ...m, weekIndex: m.weekIndex - weekOffset }));
    return (
      <div>
        {/* 月份标签:按列百分比绝对定位,与网格同宽(左留星期标签列) */}
        <div className="relative ml-[22px] h-4">
          {monthLabels.map((m) => (
            <span
              key={`${m.weekIndex + weekOffset}-${m.month}`}
              className="absolute top-0 font-mono text-[10.5px] text-grey"
              style={{ left: `${(m.weekIndex / weeks.length) * 100}%` }}
            >
              {monthText(m.month)}
            </span>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          <div className="grid w-4 shrink-0 grid-rows-7 gap-[3px] text-[10.5px] text-grey">
            {["一", "", "三", "", "五", "", "日"].map((label, index) => (
              <span key={index} className="flex items-center justify-center">
                {zh ? label : ["Mo", "", "We", "", "Fr", "", "Su"][index]}
              </span>
            ))}
          </div>
          <div className="grid min-w-0 flex-1 auto-cols-fr grid-flow-col grid-rows-7 gap-[3px]">
            {weeks.flat().map((cell) =>
              cell.inWindow ? (
                cellButton(cell)
              ) : (
                <div key={cell.date} aria-hidden="true" className="aspect-square w-full opacity-0" />
              ),
            )}
          </div>
        </div>
      </div>
    );
  };

  const pageRange = (weeks: FootprintCell[][]): string => {
    const first = weeks[0]?.[0]?.date ?? "";
    const last = weeks.at(-1)?.at(-1)?.date ?? "";
    return `${first.slice(0, 7)} → ${last.slice(0, 7)}`;
  };

  return (
    <div className="relative" onMouseLeave={() => setHovered(null)}>
      {/* 桌面:通栏 53 列(限 860px,格子 ~13px,不被拉大) */}
      <div className="max-w-[860px] max-sm:hidden">{renderGrid(grid.weeks, 0)}</div>

      {/* 移动端:半年一页,按钮/滑动切换,默认含当前月的后半年 */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            aria-label={zh ? "前半年" : "Previous half year"}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-line text-paper disabled:opacity-30"
          >
            <ChevronLeft size={13} aria-hidden="true" />
          </button>
          <span className="font-mono text-[11px] text-grey" aria-live="polite">
            {pageRange(pages[page])}
          </span>
          <button
            type="button"
            disabled={page === pages.length - 1}
            onClick={() => setPage((value) => Math.min(pages.length - 1, value + 1))}
            aria-label={zh ? "后半年" : "Next half year"}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-line text-paper disabled:opacity-30"
          >
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        </div>
        <div
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start === null) return;
            const delta = (event.changedTouches[0]?.clientX ?? start) - start;
            if (Math.abs(delta) < 40) return;
            setPage((value) =>
              Math.min(pages.length - 1, Math.max(0, value + (delta < 0 ? 1 : -1))),
            );
          }}
        >
          {renderGrid(pages[page], page === 0 ? 0 : PAGE_SPLIT)}
        </div>
      </div>

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute right-1 top-5 z-20 rounded-lg border border-line bg-moon p-3 shadow-2xl"
        >
          <div className="font-mono text-[11px] font-semibold text-paper">{hovered.date}</div>
          <div className="mt-1 font-mono text-[11px] text-paper">
            {hovered.tokens > 0 ? `${compact(hovered.tokens, zh)} tokens` : zh ? "未活跃" : "Inactive"}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-grey">
        <span className="flex items-center gap-1.5">
          {zh ? "少" : "Less"}
          <span className="flex gap-[3px]">
            {["bg-paper/[0.05]", ...STEPS].map((cls) => (
              <i key={cls} className={`h-[11px] w-[11px] rounded-[2.5px] ${cls}`} />
            ))}
          </span>
          {zh ? "多" : "More"}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:ml-auto">
          <span>
            {zh ? "近一年" : "Last year"}{" "}
            <b className="font-semibold text-paper">{compact(summary.totalTokens, zh)}</b>
          </span>
          <span>
            {zh ? "活跃" : "Active"}{" "}
            <b className="font-semibold text-paper">{summary.activeDays}</b>{" "}
            {zh ? "天" : "days"}
          </span>
          <span>
            {zh ? "单日峰值" : "Peak day"}{" "}
            <b className="font-semibold text-paper" title={summary.peakDay ?? undefined}>
              {compact(summary.peakTokens, zh)}
            </b>
          </span>
          <span>
            {zh ? "当前连续" : "Streak"}{" "}
            <b className="font-semibold text-paper">{summary.streak.current}</b>{" "}
            {zh ? "天" : "days"}
          </span>
        </span>
      </div>
    </div>
  );
}
