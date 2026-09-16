"use client";

/* Profile yearly usage history: a GitHub-style 53x7 daily token
   contribution graph. The grid and month labels are assembled
   server-side by year-grid.ts; this component only renders:
   - desktop: all 53 columns (max 860px, GitHub density);
   - mobile (below sm): split into two half-year pages with <- ->
     buttons or swipe, defaulting to the half containing the current
     month (cells go from ~5px back to ~12px);
   the 6-step blue ramp shares thresholds with the usage heatmap;
   hover/focus shows a tooltip (date + exact tokens). The tooltip is an
   anchored card following the hovered cell (the same tooltipPos +
   kb-data-tooltip surface/arrow as the usage center), not a fixed
   corner card. The visibility gate lives on the page (renders only for
   the owner or show_on_leaderboard=1). */
import { useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { compactNumber } from "@/src/lib/format";
import { tooltipPos } from "../../../usage/_components/UsageVisualizations";
import {
  footprintMonthText,
  monthLabelRightAligns,
  type FootprintCell,
  type FootprintGrid,
  type FootprintSummary,
} from "@/src/lib/usage/year-grid";

/* The same 6-step thresholds as the usage center's
   UsageHeatmapGrid. */
const STEPS = [
  "bg-viz-sequential-1",
  "bg-viz-sequential-2",
  "bg-viz-sequential-3",
  "bg-viz-sequential-4",
  "bg-viz-sequential-5",
  "bg-viz-blue-primary",
];

/* The same compact format as the usage center (compactNumber: zh
   units of 10k/100M, en K/M/B — both pages read identically). */
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
  const monthText = (month: number) => footprintMonthText(month, zh);
  const [hovered, setHovered] = useState<{
    cell: FootprintCell;
    left: number;
    top: number;
    arrowX: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  /* Mobile paging: 53 weeks split into 27 + 26 pages, defaulting to
     the latter (containing the current month/today). */
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
      onMouseEnter={(event) =>
        setHovered({ cell, ...tooltipPos(event, viewportRef.current, 176, 64) })
      }
      onFocus={(event) =>
        setHovered({ cell, ...tooltipPos(event, viewportRef.current, 176, 64) })
      }
      onBlur={() => setHovered(null)}
    />
  );

  const renderGrid = (weeks: FootprintCell[][], weekOffset: number) => {
    const monthLabels = grid.monthLabels
      .filter((m) => m.weekIndex >= weekOffset && m.weekIndex < weekOffset + weeks.length)
      .map((m) => ({ ...m, weekIndex: m.weekIndex - weekOffset }));
    return (
      <div>
        {/* Month labels: absolutely positioned by column percentage, same width as the grid (the weekday label column stays clear on the left).
            Labels in the final two columns right-align (translateX(-100%)) — the space left before the grid edge is narrower than the text,
            which would wrap a two-glyph label onto two lines; nowrap keeps every label on one line. */}
        <div className="relative ml-[22px] h-4">
          {monthLabels.map((m) => {
            const rightAligns = monthLabelRightAligns(m.weekIndex, weeks.length);
            return (
              <span
                key={`${m.weekIndex + weekOffset}-${m.month}`}
                className={`absolute top-0 whitespace-nowrap font-mono text-xs text-grey${rightAligns ? " ml-1" : ""}`}
                style={{
                  left: `${(m.weekIndex / weeks.length) * 100}%`,
                  transform: rightAligns ? "translateX(-100%)" : undefined,
                }}
              >
                {monthText(m.month)}
              </span>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1.5">
          <div className="grid w-4 shrink-0 grid-rows-7 gap-[3px] text-xs text-grey">
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
    <div ref={viewportRef} className="relative" onMouseLeave={() => setHovered(null)}>
      {/* Desktop: full-width 53 columns (capped at 860px; cells stay ~13px and never stretch) */}
      <div className="max-w-[860px] max-sm:hidden">{renderGrid(grid.weeks, 0)}</div>

      {/* Mobile: half a year per page, button/swipe navigation, defaulting to the half that contains the current month */}
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
          <span className="font-mono text-xs text-grey" aria-live="polite">
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
        /* Anchored data card: follows the hovered cell, the same surface
           as the usage center (kb-data-tooltip + viz-surface + arrow). */
        <div
          role="tooltip"
          className="kb-data-tooltip pointer-events-none absolute z-20 w-[176px] rounded-lg border border-line bg-viz-surface p-3 shadow-xl"
          style={{ left: hovered.left, top: hovered.top, "--tooltip-arrow-left": `${hovered.arrowX}px` } as CSSProperties}
        >
          <div className="font-mono text-xs font-semibold text-paper">{hovered.cell.date}</div>
          <div className="mt-1 font-mono text-xs text-paper">
            {hovered.cell.tokens > 0 ? `${compact(hovered.cell.tokens, zh)} tokens` : zh ? "未活跃" : "Inactive"}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-xs text-grey">
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
