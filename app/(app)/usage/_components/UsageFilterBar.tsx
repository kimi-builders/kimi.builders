"use client";

import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AgentIcon from "@/components/AgentIcon";
import { usageSourceLabel } from "@/src/lib/usage/labels";
import type { UsageFilterOptions } from "@/src/lib/usage/query";

interface AppliedFilters {
  range: string;
  sources?: string;
  models?: string;
  projects?: string;
  devices?: string;
  customFrom?: string;
  customTo?: string;
}

interface Dimension {
  key: "sources" | "models" | "projects" | "devices";
  label: string;
  entries: { value: string; label: string }[];
  withIcons?: boolean;
}

const RANGE_CHIPS: { id: string; zh: string; en: string }[] = [
  { id: "today", zh: "今天", en: "Today" },
  { id: "24h", zh: "24H", en: "24H" },
  { id: "7d", zh: "7D", en: "7D" },
  { id: "30d", zh: "30D", en: "30D" },
  { id: "90d", zh: "90D", en: "90D" },
];

/* 服务端 csvList 最多保留 20 个值;选项更多时「全选」等价于不带参数(无筛选)。 */
const MAX_EXPLICIT_VALUES = 20;

function parseCsv(csv: string | undefined): string[] {
  return csv ? csv.split(",").filter(Boolean) : [];
}

/* 单维度多选下拉:checkbox 列表,勾选即写 URL(逗号连接;空集 = 参数缺席)。
   外点/Escape 关闭;选择状态完全由 URL 经 props 驱动,不持有本地镜像。 */
function DimensionDropdown({
  dimension,
  selected,
  open,
  onOpenChange,
  onApply,
  zh,
}: {
  dimension: Dimension;
  selected: string[];
  open: boolean;
  onOpenChange: (id: string | null) => void;
  onApply: (key: Dimension["key"], values: string[]) => void;
  zh: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChange(null);
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const toggle = (value: string) => {
    onApply(
      dimension.key,
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };
  const selectAll = () => {
    /* 选项超过服务端上限时,全选直接清参数(语义等同);否则写显式列表。 */
    onApply(
      dimension.key,
      dimension.entries.length > MAX_EXPLICIT_VALUES
        ? []
        : dimension.entries.map((entry) => entry.value),
    );
  };

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => onOpenChange(open ? null : dimension.key)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 border border-line px-2.5 py-1.5 font-mono text-[10px] text-paper hover:border-blue sm:w-auto sm:min-w-28"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-grey">{dimension.label}</span>
          <span className="truncate">
            {selected.length === 0 ? (zh ? "全部" : "All") : `· ${selected.length}`}
          </span>
        </span>
        <ChevronDown size={11} className="shrink-0 text-grey" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full overflow-y-auto border border-line bg-moon sm:w-56">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <button
              type="button"
              onClick={selectAll}
              className="font-mono text-[9px] text-blue hover:underline"
            >
              {zh ? "全选" : "Select all"}
            </button>
            <button
              type="button"
              onClick={() => onApply(dimension.key, [])}
              className="font-mono text-[9px] text-grey hover:text-paper"
            >
              {zh ? "清空" : "Clear"}
            </button>
          </div>
          {dimension.entries.length === 0 ? (
            <p className="px-3 py-2 text-[10px] text-grey">
              {zh ? "该范围内无可选项" : "No options in range"}
            </p>
          ) : (
            dimension.entries.map((entry) => (
              <label
                key={entry.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-paper hover:bg-card"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(entry.value)}
                  onChange={() => toggle(entry.value)}
                  className="h-3.5 w-3.5 shrink-0 accent-blue"
                />
                {dimension.withIcons && <AgentIcon id={entry.value} size={12} />}
                <span className="min-w-0 truncate" title={entry.label}>
                  {entry.label}
                </span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* 筛选栏:范围 chips(含自定义日期)+ 四个多选下拉。所有状态都在 URL 上
   (可分享/可刷新);任何筛选变化把 page 重置回 1,metric/hm/ps 等原样保留。 */
export default function UsageFilterBar({
  options,
  applied,
  projectsEnabled,
  zh,
  preservedQuery,
}: {
  options: UsageFilterOptions;
  applied: AppliedFilters;
  projectsEnabled: boolean;
  zh: boolean;
  preservedQuery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(applied.range === "custom");
  const [customError, setCustomError] = useState(false);

  const handleOpenChange = useCallback((id: string | null) => setOpenMenu(id), []);

  const buildHref = (changes: Record<string, string | null>): string => {
    const params = new URLSearchParams(preservedQuery);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const text = params.toString();
    return text ? `/usage?${text}` : "/usage";
  };

  const pushParams = (changes: Record<string, string | null>) => {
    router.push(buildHref({ page: null, ...changes }), { scroll: false });
  };

  const appliedCsv: Record<Dimension["key"], string | undefined> = {
    sources: applied.sources,
    models: applied.models,
    projects: applied.projects,
    devices: applied.devices,
  };

  const dimensions: Dimension[] = [
    {
      key: "sources",
      label: zh ? "工具" : "Tool",
      entries: options.sources.map((id) => ({ value: id, label: usageSourceLabel(id) })),
      withIcons: true,
    },
    {
      key: "models",
      label: zh ? "模型" : "Model",
      entries: options.models.map((model) => ({ value: model, label: model })),
    },
    ...(projectsEnabled
      ? [
          {
            key: "projects" as const,
            label: zh ? "项目" : "Project",
            entries: options.projects.map((project) => ({ value: project, label: project })),
          },
        ]
      : []),
    {
      key: "devices",
      label: zh ? "设备" : "Device",
      entries: options.devices.map((device) => ({ value: device.id, label: device.name })),
    },
  ];

  const activeSelections = dimensions
    .map((dimension) => ({ dimension, selected: parseCsv(appliedCsv[dimension.key]) }))
    .filter((item) => item.selected.length > 0);
  const activeCount = activeSelections.reduce((sum, item) => sum + item.selected.length, 0);

  /* 日期输入是非受控的:键入只动 DOM,提交时经 FormData 读取;
     key 绑定已应用的 URL 值,导航后自动重挂载预填。 */
  const applyCustomRange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") ?? "");
    const to = String(data.get("to") ?? "");
    if (!from || !to || from > to) {
      setCustomError(true);
      return;
    }
    setCustomError(false);
    pushParams({ range: null, days: null, from, to });
  };

  const chipLabel = (dimension: Dimension, value: string): string =>
    dimension.key === "sources" ? usageSourceLabel(value) : value;

  const dateInputClass =
    "border border-line bg-bg px-2 py-1.5 font-mono text-[11px] text-paper outline-none focus:border-blue [color-scheme:dark] [html[data-theme=light]_&]:[color-scheme:light]";

  return (
    <div className="mt-5 border-b border-line pb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label={zh ? "时间范围" : "Date range"} className="flex flex-wrap items-center gap-1">
          {RANGE_CHIPS.map((chip) => {
            const isActive = applied.range === chip.id;
            return (
              <a
                key={chip.id}
                href={buildHref({ range: chip.id, from: null, to: null, days: null, page: null })}
                aria-current={isActive ? "page" : undefined}
                className={`px-3 py-1.5 font-mono text-[11px] transition-colors ${
                  isActive ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
                }`}
              >
                {zh ? chip.zh : chip.en}
              </a>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomOpen((value) => !value)}
            aria-expanded={customOpen}
            className={`px-3 py-1.5 font-mono text-[11px] transition-colors ${
              applied.range === "custom"
                ? "bg-paper text-bg"
                : "text-grey hover:bg-card hover:text-paper"
            }`}
          >
            {zh ? "自定义" : "Custom"}
          </button>
        </nav>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex items-center gap-1.5 border border-line px-2.5 py-1.5 font-mono text-[10px] text-paper hover:border-blue sm:hidden"
        >
          <SlidersHorizontal size={11} />
          {zh ? "筛选" : "Filters"}
          {activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        <div
          className={`${
            open ? "flex" : "hidden"
          } w-full flex-col gap-2 pt-1 sm:flex sm:w-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:pt-0`}
        >
          {dimensions.map((dimension) => (
            <DimensionDropdown
              key={dimension.key}
              dimension={dimension}
              selected={parseCsv(appliedCsv[dimension.key])}
              open={openMenu === dimension.key}
              onOpenChange={handleOpenChange}
              onApply={(key, values) =>
                pushParams({ [key]: values.length > 0 ? values.join(",") : null })
              }
              zh={zh}
            />
          ))}
          {activeCount > 0 && (
            <a
              href={buildHref({ sources: null, models: null, projects: null, devices: null, page: null })}
              className="font-mono text-[10px] text-blue hover:underline"
            >
              {zh ? "清除筛选" : "Clear filters"}
            </a>
          )}
        </div>
      </div>

      {customOpen && (
        <form onSubmit={applyCustomRange} className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            type="date"
            name="from"
            key={`from-${applied.customFrom ?? ""}`}
            defaultValue={applied.customFrom ?? ""}
            aria-label={zh ? "开始日期" : "From date"}
            className={dateInputClass}
          />
          <span className="font-mono text-[10px] text-grey">→</span>
          <input
            type="date"
            name="to"
            key={`to-${applied.customTo ?? ""}`}
            defaultValue={applied.customTo ?? ""}
            aria-label={zh ? "结束日期" : "To date"}
            className={dateInputClass}
          />
          <button
            type="submit"
            className="border border-line px-3 py-1.5 font-mono text-[10px] text-paper hover:border-blue"
          >
            {zh ? "应用" : "Apply"}
          </button>
          {customError && (
            <span className="font-mono text-[10px] text-red-400">
              {zh ? "需要 开始 ≤ 结束" : "From must be on or before To"}
            </span>
          )}
        </form>
      )}

      {activeCount > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {activeSelections.flatMap(({ dimension, selected }) => {
            if (selected.length > 2) {
              return (
                <span
                  key={dimension.key}
                  className="flex max-w-full items-center gap-1.5 border border-line px-2 py-1 font-mono text-[10px] text-paper"
                >
                  <span className="shrink-0 text-grey">{dimension.label}</span>
                  <span>×{selected.length}</span>
                  <a
                    href={buildHref({ [dimension.key]: null, page: null })}
                    aria-label={zh ? `清除${dimension.label}筛选` : `Clear ${dimension.label} filter`}
                    className="shrink-0 text-grey hover:text-paper"
                  >
                    <X size={10} />
                  </a>
                </span>
              );
            }
            return selected.map((value) => {
              const rest = selected.filter((item) => item !== value);
              return (
                <span
                  key={`${dimension.key}-${value}`}
                  className="flex max-w-full items-center gap-1.5 border border-line px-2 py-1 font-mono text-[10px] text-paper"
                >
                  <span className="shrink-0 text-grey">{dimension.label}</span>
                  <span className="max-w-40 truncate">{chipLabel(dimension, value)}</span>
                  <a
                    href={buildHref({
                      [dimension.key]: rest.length > 0 ? rest.join(",") : null,
                      page: null,
                    })}
                    aria-label={zh ? `移除筛选 ${chipLabel(dimension, value)}` : `Remove filter ${chipLabel(dimension, value)}`}
                    className="shrink-0 text-grey hover:text-paper"
                  >
                    <X size={10} />
                  </a>
                </span>
              );
            });
          })}
        </div>
      )}
    </div>
  );
}
