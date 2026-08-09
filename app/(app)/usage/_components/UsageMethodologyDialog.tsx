"use client";

import { useId, useRef } from "react";
import { CircleHelp, Info, X } from "lucide-react";
import type { UsagePricingMatch } from "@/src/lib/usage/query";

type GuideKind = "all" | "pricing" | "tokens" | "duration" | "changes";

interface Props {
  kind?: GuideKind;
  compact?: boolean;
  zh: boolean;
  pricingMatches?: UsagePricingMatch[];
  pricingCoverage?: string;
  pricingVersions?: string;
  currentRange: { from: string; to: string };
  tzLabel: string;
}

function rate(value: number | null, fallback: boolean): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}/M${fallback ? "*" : ""}`;
}

function localDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default function UsageMethodologyDialog({
  kind = "all",
  compact = false,
  zh,
  pricingMatches = [],
  pricingCoverage = "—",
  pricingVersions = "",
  currentRange,
  tzLabel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId().replaceAll(":", "");
  const titleId = `usage-guide-${kind}-${uid}`;
  const span = new Date(currentRange.to).getTime() - new Date(currentRange.from).getTime();
  const previousRange = {
    from: new Date(new Date(currentRange.from).getTime() - span).toISOString(),
    to: currentRange.from,
  };
  const locale = zh ? "zh-CN" : "en-US";
  const sections = kind === "all" ? ["tokens", "pricing", "duration", "changes"] : [kind];
  const title =
    kind === "pricing"
      ? zh
        ? "模型定价匹配"
        : "Model pricing matches"
      : kind === "duration"
        ? zh
          ? "会话时长说明"
          : "Session time definitions"
        : kind === "changes"
          ? zh
            ? "变化百分比说明"
            : "Change percentage"
          : kind === "tokens"
            ? zh
              ? "Token 数据说明"
              : "Token data definitions"
            : zh
              ? "计算与数据说明"
              : "Calculation & data guide";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={title}
        title={title}
        className={
          compact
            ? "inline-flex shrink-0 text-grey/70 hover:text-blue"
            : "inline-flex items-center gap-1.5 border border-line px-3 py-1.5 font-mono text-[10px] text-grey hover:border-blue hover:text-paper"
        }
      >
        {compact ? <CircleHelp size={12} /> : <><Info size={12} />{title}</>}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[86vh] w-[min(94vw,64rem)] overflow-hidden border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-card px-5 py-4">
          <div>
            <h2 id={titleId} className="font-mono text-sm font-semibold tracking-[0.06em]">{title}</h2>
            <p className="mt-1 text-[11px] text-grey">
              {zh ? `${tzLabel} · 所有金额先按 USD 标准 API 价格计算` : `${tzLabel} · all costs start from standard USD API prices`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={zh ? "关闭" : "Close"}
            className="shrink-0 text-grey hover:text-paper"
          >
            <X size={17} />
          </button>
        </div>

        <div className="max-h-[calc(86vh-66px)] overflow-y-auto px-5 py-5 text-xs leading-relaxed text-grey sm:px-6">
          {sections.includes("tokens") && (
            <section>
              <h3 className="font-mono text-xs font-semibold text-paper">{zh ? "Token 与图表" : "Tokens and charts"}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="border border-line bg-card p-3">
                  <div className="font-mono text-[10px] text-paper">TOTAL TOKENS</div>
                  <p className="mt-1.5">
                    {zh
                      ? "输入 + 缓存写 + 缓存读 + 可见输出 + 推理输出。趋势图用同一份五类事实，输出与推理即使占比很小也保留最小可见高度。"
                      : "Input + cache write + cache read + visible output + reasoning output. The trend uses the same five facts and preserves a visible minimum for small output/reasoning slices."}
                  </p>
                </div>
                <div className="border border-line bg-card p-3">
                  <div className="font-mono text-[10px] text-paper">
                    {zh ? "累计 TOKEN" : "LIFETIME TOKENS"}
                  </div>
                  <p className="mt-1.5">
                    {zh
                      ? "全部已同步历史，不受今天/7D/30D 等日期范围影响；工具、模型、项目和设备筛选仍然生效。"
                      : "All synced history, independent of Today/7D/30D. Source, model, project, and device filters still apply."}
                  </p>
                </div>
                <div className="border border-line bg-card p-3">
                  <div className="font-mono text-[10px] text-paper">PEAK TOKENS</div>
                  <p className="mt-1.5">
                    {zh
                      ? "当前日期范围内，按当前趋势粒度（小时/日/自然周）最高的一个时间格，不是单次请求峰值。"
                      : "The highest displayed hour/day/natural-week slot in the selected range—not a single-request maximum."}
                  </p>
                </div>
                <div className="border border-line bg-card p-3">
                  <div className="font-mono text-[10px] text-paper">WEEKLY / HEATMAP</div>
                  <p className="mt-1.5">
                    {zh
                      ? "自然周固定为本地周一 00:00 到下周一 00:00。热图把所选日期范围内相同星期与小时累加，不代表某一个具体日期。"
                      : "Natural weeks run local Monday 00:00 to next Monday 00:00. Heatmap cells aggregate the same weekday/hour across the selected range, not one specific date."}
                  </p>
                </div>
              </div>
            </section>
          )}

          {sections.includes("pricing") && (
            <section className={sections[0] === "pricing" ? "" : "mt-7 border-t border-line pt-6"}>
              <h3 className="font-mono text-xs font-semibold text-paper">{zh ? "标准 API 估费" : "Standard API cost estimate"}</h3>
              <p className="mt-2">
                {zh
                  ? `每个 30 分钟事实桶按发生时间匹配服务端版本化标准 API 价格。当前覆盖 ${pricingCoverage} Token，命中版本 ${pricingVersions || "—"}。这是 API 等价估算，不是 Kimi Code、Claude Code、Codex 等订阅账单或实际扣款。`
                  : `Every 30-minute fact bucket is matched to the versioned standard API price active at that time. Current coverage is ${pricingCoverage}; matched versions: ${pricingVersions || "—"}. This is an API-equivalent estimate, not a subscription invoice or actual charge.`}
              </p>
              <code className="mt-3 block overflow-x-auto border border-line bg-card p-3 font-mono text-[10px] text-paper">
                cost = Σ(tokens ÷ 1,000,000 × category API rate)
              </code>
              <p className="mt-2 text-[10px]">
                {zh
                  ? "匹配顺序：精确模型名 → 最长前缀 → 来源限定 → 生效时间。* 表示供应商未单列该类价格：缓存写回退输入价，推理回退输出价；缓存读没有价格时不回退并标记部分定价。"
                  : "Match order: exact name → longest prefix → source restriction → effective window. * means the provider does not publish a separate category: cache write falls back to input and reasoning to output. Missing cache-read price does not fall back and is marked partial."}
              </p>

              <div className="mt-4 overflow-x-auto border border-line">
                <table className="w-full min-w-[900px] border-collapse font-mono text-[10px]">
                  <thead className="bg-card text-left text-grey">
                    <tr>
                      <th className="px-3 py-2 font-normal">{zh ? "模型" : "MODEL"}</th>
                      <th className="px-3 py-2 font-normal">{zh ? "匹配" : "MATCH"}</th>
                      <th className="px-3 py-2 text-right font-normal">{zh ? "输入" : "INPUT"}</th>
                      <th className="px-3 py-2 text-right font-normal">{zh ? "缓存写" : "CACHE W"}</th>
                      <th className="px-3 py-2 text-right font-normal">{zh ? "缓存读" : "CACHE R"}</th>
                      <th className="px-3 py-2 text-right font-normal">{zh ? "输出" : "OUTPUT"}</th>
                      <th className="px-3 py-2 text-right font-normal">{zh ? "推理" : "REASON"}</th>
                      <th className="px-3 py-2 font-normal">{zh ? "版本" : "VERSION"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingMatches.length === 0 ? (
                      <tr><td colSpan={8} className="border-t border-line px-3 py-4 text-center text-grey">{zh ? "当前范围内没有模型数据" : "No model data in this range"}</td></tr>
                    ) : (
                      pricingMatches.map((row) => (
                        <tr key={`${row.source}-${row.model}-${row.version}-${row.effectiveFrom}`} className="border-t border-line">
                          <td className="max-w-[220px] truncate px-3 py-2 text-paper" title={`${row.source} · ${row.model}`}>{row.model}</td>
                          <td className={`max-w-[180px] truncate px-3 py-2 ${row.matchedPattern ? "text-emerald-400" : "text-grey"}`} title={row.matchedPattern ?? undefined}>
                            {row.matchedPattern ?? (zh ? "未匹配" : "unmatched")}
                          </td>
                          <td className="px-3 py-2 text-right">{rate(row.inputPerMtok, false)}</td>
                          <td className="px-3 py-2 text-right">{rate(row.cacheWritePerMtok, row.cacheWriteFallback)}</td>
                          <td className="px-3 py-2 text-right">{rate(row.cacheReadPerMtok, false)}</td>
                          <td className="px-3 py-2 text-right">{rate(row.outputPerMtok, false)}</td>
                          <td className="px-3 py-2 text-right">{rate(row.reasoningPerMtok, row.reasoningFallback)}</td>
                          <td className="px-3 py-2 text-grey">{row.version ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {sections.includes("duration") && (
            <section className={sections[0] === "duration" ? "" : "mt-7 border-t border-line pt-6"}>
              <h3 className="font-mono text-xs font-semibold text-paper">{zh ? "会话时长" : "Session time"}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="border-l-2 border-blue pl-3">
                  <div className="font-mono text-[10px] text-paper">{zh ? "活跃时长" : "ACTIVE TIME"}</div>
                  <p className="mt-1.5">
                    {zh
                      ? "按用户发起的 turn 统计 AI/工具实际产生活动的事件间隔；同一 turn 内每段间隔最多计 5 分钟，排除排队等待和首 Token 延迟。不同工具日志精度不同，因此这是跨工具可比的近似值。"
                      : "AI/tool activity gaps inside user-initiated turns, capped at 5 minutes per gap. Queueing and time-to-first-token are excluded. Log precision varies by tool, so this is a cross-tool comparable approximation."}
                  </p>
                </div>
                <div className="border-l-2 border-paper/50 pl-3">
                  <div className="font-mono text-[10px] text-paper">{zh ? "投入时长" : "ENGAGED TIME"}</div>
                  <p className="mt-1.5">
                    {zh
                      ? "会话内从首条到末条事件的相邻时间跨度之和，包含思考、阅读和查看代码；每段空闲间隔最多计 30 分钟，不包含会话之间的间隔。"
                      : "Sum of adjacent event spans inside a session, including thinking, reading, and code review. Each idle gap is capped at 30 minutes; gaps between sessions are excluded."}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[10px]">
                {zh ? "按模型筛选时，会话日志没有模型字段，因此会话数、消息数与时长不会按模型拆分。" : "Session logs do not carry a model field, so sessions, messages, and time are not split by model filters."}
              </p>
            </section>
          )}

          {sections.includes("changes") && (
            <section className={sections[0] === "changes" ? "" : "mt-7 border-t border-line pt-6"}>
              <h3 className="font-mono text-xs font-semibold text-paper">{zh ? "变化百分比" : "Change percentage"}</h3>
              <code className="mt-3 block overflow-x-auto border border-line bg-card p-3 font-mono text-[10px] text-paper">
                change = (current − previous) ÷ previous × 100%
              </code>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="font-mono text-[10px] text-paper">{zh ? "当前周期" : "CURRENT"}</div>
                  <p className="mt-1">{localDateTime(currentRange.from, locale)} → {localDateTime(currentRange.to, locale)}</p>
                </div>
                <div>
                  <div className="font-mono text-[10px] text-paper">{zh ? "上一等长周期" : "PREVIOUS EQUAL PERIOD"}</div>
                  <p className="mt-1">{localDateTime(previousRange.from, locale)} → {localDateTime(previousRange.to, locale)}</p>
                </div>
              </div>
              <p className="mt-3">
                {zh
                  ? "绿色为增长，红色为下降。上期为 0 时不做除法，显示「—」。每周趋势里的百分比固定比较相邻两个自然周；末周未满 7 天时仍会与完整上周比较。"
                  : "Green means growth and red means decline. A zero previous value displays “—”. Weekly deltas compare adjacent natural weeks; a partial final week is still compared with the full prior week."}
              </p>
            </section>
          )}
        </div>
      </dialog>
    </>
  );
}
