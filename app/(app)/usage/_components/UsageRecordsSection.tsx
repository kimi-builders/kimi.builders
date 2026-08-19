"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import { compactNumber } from "@/src/lib/format";
import { usageCacheHitRate } from "@/src/lib/usage-contract";
import { usageSourceLabel } from "@/src/lib/usage/labels";
import { usageModelDetail } from "@/src/lib/usage/model-meta";
import type { UsageRecordGrain } from "@/src/lib/usage/filters";
import type { UsageOverview, UsageRecordRow } from "@/src/lib/usage/query";
import RecordsColumnsMenu, {
  OPTIONAL_RECORD_COLUMNS,
  type OptionalRecordColumn,
} from "./RecordsColumnsMenu";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

function compact(value: number, zh: boolean): string {
  return compactNumber(value, zh ? "zh" : "en");
}

interface UsageRecordCurrency {
  rate: number;
  symbol: string;
}

function formatCost(micros: number, currency: UsageRecordCurrency): string {
  const { rate, symbol } = currency;
  const value = (micros / 1e6) * rate;
  return `${symbol}${value >= 0.01 ? value.toFixed(2) : value.toFixed(4)}`;
}

function formatHitRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function recordCost(
  row: UsageRecordRow,
  zh: boolean,
  currency: UsageRecordCurrency,
): ReactNode {
  if (row.priceStatus === "legacy") return <span className="text-grey">—</span>;
  if (row.priceStatus === "unpriced") {
    return <span className="text-grey">{zh ? "未定价" : "unpriced"}</span>;
  }
  return (
    <>
      {formatCost(row.costMicros, currency)}
      {row.priceStatus === "partial" ? "*" : ""}
    </>
  );
}

function hrefWith(currentQuery: string, changes: Record<string, string | null>): string {
  const params = new URLSearchParams(currentQuery);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `/usage?${text}` : "/usage";
}

function normalizeColumns(values: readonly string[]): OptionalRecordColumn[] {
  const selected = new Set(values);
  return OPTIONAL_RECORD_COLUMNS.map((column) => column.id).filter((id) => selected.has(id));
}

interface RecordColumn {
  id: string;
  header: string;
  cell: (row: UsageRecordRow) => ReactNode;
  className?: string;
  /* 数字列(20260819 版式对齐):表头/单元格右对齐,与品牌手册「数字列右对齐」一致 */
  numeric?: boolean;
  titleOf?: (row: UsageRecordRow) => string | undefined;
}

export default function UsageRecordsSection({
  records,
  grain,
  initialEnabledColumns,
  preservedQuery,
  tzOffsetMinutes,
  currency,
  zh,
}: {
  records: UsageOverview["records"];
  grain: UsageRecordGrain;
  initialEnabledColumns: string[];
  preservedQuery: string;
  tzOffsetMinutes: number;
  currency: UsageRecordCurrency;
  zh: boolean;
}) {
  const [enabledColumns, setEnabledColumns] = useState<OptionalRecordColumn[]>(() =>
    normalizeColumns(initialEnabledColumns),
  );

  const enabled = useMemo(() => new Set(enabledColumns), [enabledColumns]);
  const queryWithColumns = useMemo(() => {
    const params = new URLSearchParams(preservedQuery);
    if (enabledColumns.length > 0) params.set("cols", enabledColumns.join(","));
    else params.delete("cols");
    return params.toString();
  }, [enabledColumns, preservedQuery]);

  const changeColumns = (next: OptionalRecordColumn[]) => {
    const normalized = normalizeColumns(next);
    setEnabledColumns(normalized);
    const params = new URLSearchParams(window.location.search);
    if (normalized.length > 0) params.set("cols", normalized.join(","));
    else params.delete("cols");
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  };

  const totalPages = Math.max(1, Math.ceil(records.total / records.pageSize));
  const previousHref = records.page > 1
    ? hrefWith(queryWithColumns, {
        page: records.page - 1 > 1 ? String(records.page - 1) : null,
      })
    : null;
  const nextHref = records.page < totalPages
    ? hrefWith(queryWithColumns, { page: String(records.page + 1) })
    : null;
  const grainItems = [
    {
      key: "day",
      label: zh ? "按日" : "By day",
      href: hrefWith(queryWithColumns, { grain: null, page: null }),
      active: grain === "day",
    },
    {
      key: "bucket",
      label: zh ? "按 30 分钟" : "By 30 min",
      href: hrefWith(queryWithColumns, { grain: "bucket", page: null }),
      active: grain === "bucket",
    },
  ];

  const notUploadedLabel = zh ? "未上传" : "Not uploaded";
  const pad2 = (value: number) => String(value).padStart(2, "0");
  const bucketTimeLabel = (iso: string): string => {
    const shifted = new Date(new Date(iso).getTime() + tzOffsetMinutes * 60_000);
    return `${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())} ${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
  };
  const truncateCell = "max-w-[180px] truncate whitespace-nowrap py-2 pr-4 text-paper";
  const columns: RecordColumn[] = [
    {
      id: "time",
      header: grain === "bucket" ? (zh ? "时间" : "TIME") : zh ? "日期" : "DAY",
      cell: (row) => (grain === "bucket" && row.time ? bucketTimeLabel(row.time) : row.day),
    },
    {
      id: "source",
      header: zh ? "Agent" : "AGENT",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <AgentIcon id={row.source} size={12} />
          {usageSourceLabel(row.source)}
        </span>
      ),
    },
    {
      id: "model",
      header: zh ? "模型" : "MODEL",
      className: truncateCell,
      titleOf: (row) => usageModelDetail({
        source: row.source,
        model: row.model,
        modelCanonical: row.modelCanonical,
        modelProvider: row.modelProvider,
      }),
      cell: (row) => (
        <span>
          <span className="block truncate">{row.modelDisplayName}</span>
          {row.modelDisplayName !== row.model && (
            <span className="block truncate text-xs text-grey">{row.model}</span>
          )}
        </span>
      ),
    },
  ];
  if (enabled.has("project")) {
    columns.push({
      id: "project",
      header: zh ? "项目" : "PROJECT",
      className: "max-w-[140px] truncate whitespace-nowrap py-2 pr-4 text-paper",
      titleOf: (row) => row.project ?? notUploadedLabel,
      cell: (row) => row.project === null
        ? <span className="text-grey">{notUploadedLabel}</span>
        : row.project,
    });
  }
  if (enabled.has("device")) {
    columns.push({
      id: "device",
      header: zh ? "设备" : "DEVICE",
      className: "max-w-[120px] truncate whitespace-nowrap py-2 pr-4 text-paper",
      titleOf: (row) => row.deviceDetail,
      cell: (row) => row.deviceName,
    });
  }
  if (enabled.has("effort")) {
    columns.push({
      id: "effort",
      header: zh ? "推理强度" : "EFFORT",
      cell: (row) => row.reasoningEffort || <span className="text-grey">—</span>,
    });
  }
  if (enabled.has("agentVersion")) {
    columns.push({
      id: "agentVersion",
      header: zh ? "AGENT 版本" : "AGENT VER.",
      className: "max-w-[130px] truncate whitespace-nowrap py-2 pr-4 text-paper",
      titleOf: (row) => row.agentVersion || undefined,
      cell: (row) => row.agentVersion || <span className="text-grey">—</span>,
    });
  }
  if (enabled.has("modelProvider")) {
    columns.push({
      id: "modelProvider",
      header: zh ? "模型供应方" : "PROVIDER",
      className: "max-w-[130px] truncate whitespace-nowrap py-2 pr-4 text-paper",
      titleOf: (row) => row.modelProvider || undefined,
      cell: (row) => row.modelProvider || <span className="text-grey">—</span>,
    });
  }
  columns.push({
    id: "input",
    header: zh ? "输入(含缓存写)" : "INPUT+CW",
    numeric: true,
    cell: (row) => compact(row.inputTokens + row.cacheWriteInputTokens, zh),
  });
  if (enabled.has("cacheWrite")) {
    columns.push({
      id: "cacheWrite",
      header: zh ? "缓存写" : "CACHE W",
      numeric: true,
      cell: (row) => compact(row.cacheWriteInputTokens, zh),
    });
  }
  columns.push(
    {
      id: "cacheRead",
      header: zh ? "缓存读" : "CACHE R",
      numeric: true,
      cell: (row) => compact(row.cacheReadInputTokens, zh),
    },
    {
      id: "output",
      header: zh ? "输出" : "OUTPUT",
      numeric: true,
      cell: (row) => compact(row.outputTokens, zh),
    },
  );
  if (enabled.has("reasoning")) {
    columns.push({
      id: "reasoning",
      header: zh ? "推理" : "REASON",
      numeric: true,
      cell: (row) => compact(row.reasoningOutputTokens, zh),
    });
  }
  columns.push(
    {
      id: "total",
      header: zh ? "总 TOKEN" : "TOTAL",
      numeric: true,
      cell: (row) => compact(row.totalTokens, zh),
    },
    {
      id: "hitRate",
      header: zh ? "命中率" : "HIT%",
      numeric: true,
      cell: (row) => {
        const rate = usageCacheHitRate(row);
        if (rate === null) return <span className="text-grey">—</span>;
        return (
          <span className="rounded-full bg-status-ok/10 px-1.5 py-0.5 text-xs text-status-ok-fg">
            {formatHitRate(rate)}
          </span>
        );
      },
    },
    {
      id: "requests",
      header: zh ? "请求" : "REQS",
      numeric: true,
      cell: (row) => compact(row.requests, zh),
    },
    {
      id: "cost",
      header: zh ? "估费" : "COST",
      numeric: true,
      className: "whitespace-nowrap py-2 text-right text-paper",
      cell: (row) => recordCost(row, zh, currency),
    },
  );

  return (
    <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-paper">
            {zh ? "明细" : "Records"}
          </h2>
          <p className="mt-1 font-mono text-xs text-grey">
            {zh
              ? `按 ${grain === "bucket" ? "30分钟" : "日"}×Agent×模型×推理强度×Agent版本×项目×设备 聚合 · 共 ${records.total.toLocaleString("zh-CN")} 组`
              : `Grouped by ${grain === "bucket" ? "30-min" : "day"} × agent × model × effort × Agent version × project × device · ${records.total.toLocaleString("en-US")} groups`}
          </p>
          {grain === "bucket" && (
            <p className="mt-1 font-mono text-xs text-grey/80">
              {zh
                ? "30 分钟为采集最细粒度，秒级不在日志中"
                : "30 minutes is the finest collected granularity; seconds are not in the logs."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label={zh ? "明细粒度" : "Record grain"} className={SEG_WRAP}>
            {grainItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                scroll={false}
                aria-current={item.active ? "page" : undefined}
                className={`${SEG_ITEM} ${item.active ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <RecordsColumnsMenu enabled={enabledColumns} onChange={changeColumns} zh={zh} />
        </div>
      </div>

      {records.rows.length === 0 ? (
        <p className="mt-4 text-xs text-grey">{zh ? "该范围内暂无数据" : "No data in this range"}</p>
      ) : (
        <>
          <div className="mt-4 hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-xs">
                <thead>
                  <tr className="text-left font-mono text-xs tracking-wide text-grey">
                    {columns.map((column) => (
                      <th
                        key={column.id}
                        className={`whitespace-nowrap pb-2 pr-4 font-normal ${column.numeric ? "text-right" : ""}`}
                      >
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.rows.map((row, index) => (
                    <tr
                      key={`${row.day}-${row.time ?? ""}-${row.source}-${row.model}-${row.project ?? ""}-${row.deviceId}-${index}`}
                      className="border-t border-line transition-colors hover:bg-paper/[0.03]"
                    >
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={column.className ?? `whitespace-nowrap py-2 pr-4 text-paper${column.numeric ? " text-right" : ""}`}
                          title={column.titleOf?.(row)}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ul className="mt-4 space-y-2 sm:hidden">
            {records.rows.map((row, index) => (
              <li
                key={`${row.day}-${row.time ?? ""}-${row.source}-${row.model}-${row.project ?? ""}-${row.deviceId}-${index}`}
                className="rounded-lg border border-line p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="shrink-0 font-mono text-xs text-grey">
                    {grain === "bucket" && row.time ? bucketTimeLabel(row.time) : row.day}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-paper">
                    <AgentIcon id={row.source} size={12} />
                    <span
                      className="truncate"
                      title={`${usageSourceLabel(row.source)} · ${usageModelDetail({
                        source: row.source,
                        model: row.model,
                        modelCanonical: row.modelCanonical,
                        modelProvider: row.modelProvider,
                      })}`}
                    >
                      {usageSourceLabel(row.source)} · {row.modelDisplayName}
                    </span>
                  </span>
                </div>
                <div className="mt-2 font-mono text-xs text-grey">
                  {compact(row.totalTokens, zh)} tokens · {recordCost(row, zh, currency)} · {zh ? "命中率" : "hit"}{" "}
                  {formatHitRate(usageCacheHitRate(row))} · {compact(row.requests, zh)} {zh ? "次请求" : "req"}
                </div>
                {row.modelDisplayName !== row.model && (
                  <div className="mt-1 truncate font-mono text-xs text-grey/70">raw model: {row.model}</div>
                )}
                {enabled.size > 0 && (
                  <div className="mt-1 space-y-0.5 font-mono text-xs text-grey">
                    {enabled.has("project") && <p>{zh ? "项目" : "Project"} {row.project ?? notUploadedLabel}</p>}
                    {enabled.has("device") && <p>{zh ? "设备" : "Device"} {row.deviceDetail}</p>}
                    {enabled.has("effort") && <p>{zh ? "推理强度" : "Effort"} {row.reasoningEffort || "—"}</p>}
                    {enabled.has("agentVersion") && <p>{zh ? "Agent 版本" : "Agent version"} {row.agentVersion || "—"}</p>}
                    {enabled.has("modelProvider") && <p>{zh ? "模型供应方" : "Model provider"} {row.modelProvider || "—"}</p>}
                    {enabled.has("cacheWrite") && <p>{zh ? "缓存写" : "Cache write"} {compact(row.cacheWriteInputTokens, zh)}</p>}
                    {enabled.has("reasoning") && <p>{zh ? "推理" : "Reasoning"} {compact(row.reasoningOutputTokens, zh)}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
        {previousHref ? (
          <Link
            href={previousHref}
            scroll={false}
            aria-label={zh ? "上一页" : "Previous page"}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-paper hover:border-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-lg border border-line text-grey/40"
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </span>
        )}
        <span className="font-mono text-xs text-grey" aria-live="polite">
          {zh ? `第 ${records.page} / ${totalPages} 页` : `Page ${records.page} / ${totalPages}`}
        </span>
        {nextHref ? (
          <Link
            href={nextHref}
            scroll={false}
            aria-label={zh ? "下一页" : "Next page"}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-paper hover:border-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-lg border border-line text-grey/40"
          >
            <ChevronRight size={14} aria-hidden="true" />
          </span>
        )}
      </div>
    </section>
  );
}
