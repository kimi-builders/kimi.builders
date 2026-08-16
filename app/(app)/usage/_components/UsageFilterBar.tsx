"use client";

import { ChevronDown, LoaderCircle, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import AgentIcon from "@/components/AgentIcon";
import CheckboxControl from "@/components/CheckboxControl";
import { usageSourceLabel } from "@/src/lib/usage/labels";
import { usageModelDisplayName } from "@/src/lib/usage/model-meta";
import type { UsageFilterOptions } from "@/src/lib/usage/query";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

interface AppliedFilters {
  range: string;
  sources?: string;
  models?: string;
  efforts?: string;
  agentVersions?: string;
  projects?: string;
  devices?: string;
  customFrom?: string;
  customTo?: string;
}

interface Dimension {
  key: "sources" | "models" | "efforts" | "agentVersions" | "projects" | "devices";
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

/* 单维度多选下拉:先在本地暂存勾选,点击“应用”后只触发一次服务端导航。
   空集 = 参数缺席 = 不限;外点/Escape 关闭且不会误提交草稿。 */
function DimensionDropdown({
  dimension,
  selected,
  open,
  onOpenChange,
  onApply,
  pending,
  zh,
}: {
  dimension: Dimension;
  selected: string[];
  open: boolean;
  onOpenChange: (id: string | null) => void;
  onApply: (key: Dimension["key"], values: string[]) => void;
  pending: boolean;
  zh: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string[]>(selected);
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
    setDraft((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value].slice(0, MAX_EXPLICIT_VALUES),
    );
  };
  const dirty = [...draft].sort().join("\u0000") !== [...selected].sort().join("\u0000");

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!open) setDraft(selected);
          onOpenChange(open ? null : dimension.key);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 font-mono text-[11px] text-paper hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 sm:min-h-9 sm:w-auto sm:min-w-28"
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
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-lg border border-line bg-moon shadow-xl sm:w-64">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="font-mono text-[11px] text-grey">
              {zh ? "不勾选表示不限" : "No selection means any"}
            </span>
            <button
              type="button"
              onClick={() => setDraft([])}
              className="min-h-11 px-2 font-mono text-[11px] text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "不限" : "Any"}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {dimension.entries.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-grey">
                {zh ? "该范围内无可选项" : "No options in range"}
              </p>
            ) : (
              dimension.entries.map((entry) => (
                <label
                  key={entry.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs text-paper hover:bg-card"
                >
                  <CheckboxControl
                    checked={draft.includes(entry.value)}
                    onChange={() => toggle(entry.value)}
                  />
                  {dimension.withIcons && <AgentIcon id={entry.value} size={12} />}
                  <span className="min-w-0 truncate" title={entry.label}>
                    {entry.label}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line p-2">
            <button
              type="button"
              onClick={() => onOpenChange(null)}
              className="min-h-11 px-3 font-mono text-[11px] text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={() => {
                onApply(dimension.key, draft);
                onOpenChange(null);
              }}
              className="min-h-11 rounded-lg border border-blue px-3 font-mono text-[11px] text-paper hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-40"
            >
              {zh ? "应用" : "Apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* 筛选栏:时间分段 + 维度多选下拉(主:Agent/模型/项目;次:推理强度/Agent 版本/设备,
   收进「更多筛选」虚线 chip)。所有状态都在 URL 上(可分享/可刷新);任何筛选变化把
   page 重置回 1,metric/hm/ps 等原样保留。trailing 渲染在行右端(币种切换)。 */
export default function UsageFilterBar({
  options,
  applied,
  projectsEnabled,
  zh,
  preservedQuery,
  trailing,
}: {
  options: UsageFilterOptions;
  applied: AppliedFilters;
  projectsEnabled: boolean;
  zh: boolean;
  preservedQuery: string;
  trailing?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(applied.range === "custom");
  const [customError, setCustomError] = useState(false);
  const [pending, startTransition] = useTransition();
  /* 次级维度(推理强度/Agent 版本/设备)默认收起;已有激活选择时首渲染即展开。 */
  const [moreOpen, setMoreOpen] = useState(
    () =>
      parseCsv(applied.efforts).length +
        parseCsv(applied.agentVersions).length +
        parseCsv(applied.devices).length >
        0,
  );

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
    setOpenMenu(null);
    startTransition(() => {
      router.push(buildHref({ page: null, ...changes }), { scroll: false });
    });
  };

  const appliedCsv: Record<Dimension["key"], string | undefined> = {
    sources: applied.sources,
    models: applied.models,
    efforts: applied.efforts,
    agentVersions: applied.agentVersions,
    projects: applied.projects,
    devices: applied.devices,
  };

  const dimensions: Dimension[] = [
    {
      key: "sources",
      label: zh ? "Agent" : "Agent",
      entries: options.sources.map((id) => ({ value: id, label: usageSourceLabel(id) })),
      withIcons: true,
    },
    {
      key: "models",
      label: zh ? "模型" : "Model",
      entries: options.models.map((model) => ({
        value: model,
        label: (() => {
          const display = usageModelDisplayName({ model });
          return display === model ? model : `${display} · ${model}`;
        })(),
      })),
    },
    {
      key: "efforts",
      label: zh ? "推理强度" : "Effort",
      entries: options.efforts.map((effort) => ({ value: effort, label: effort })),
    },
    {
      key: "agentVersions",
      label: zh ? "Agent 版本" : "Agent version",
      entries: options.agentVersions.map((version) => ({ value: version, label: version })),
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

  /* 主维度常显,次维度收进「更多筛选」虚线 chip。 */
  const PRIMARY_KEYS: Dimension["key"][] = ["sources", "models", "projects"];
  const primaryDimensions = dimensions.filter((d) => PRIMARY_KEYS.includes(d.key));
  const secondaryDimensions = dimensions.filter((d) => !PRIMARY_KEYS.includes(d.key));
  const secondaryActiveCount = secondaryDimensions.reduce(
    (sum, d) => sum + parseCsv(appliedCsv[d.key]).length,
    0,
  );
  const renderDropdown = (dimension: Dimension) => (
    <DimensionDropdown
      key={dimension.key}
      dimension={dimension}
      selected={parseCsv(appliedCsv[dimension.key])}
      open={openMenu === dimension.key}
      onOpenChange={handleOpenChange}
      onApply={(key, values) =>
        pushParams({ [key]: values.length > 0 ? values.join(",") : null })
      }
      pending={pending}
      zh={zh}
    />
  );

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

  const chipLabel = (dimension: Dimension, value: string): string => {
    if (dimension.key === "sources") return usageSourceLabel(value);
    if (dimension.key === "models") return usageModelDisplayName({ model: value });
    return value;
  };

  const dateInputClass =
    "min-h-11 rounded-lg border border-line bg-bg px-2 font-mono text-[11px] text-paper outline-none focus:border-blue [color-scheme:dark] [html[data-theme=light]_&]:[color-scheme:light]";

  return (
    <div className="mt-5 border-b border-line pb-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <nav
          aria-label={zh ? "时间范围" : "Date range"}
          className={`${SEG_WRAP} max-sm:w-full max-sm:flex-wrap`}
        >
          {RANGE_CHIPS.map((chip) => {
            const isActive = applied.range === chip.id;
            return (
              <button
                type="button"
                key={chip.id}
                disabled={pending}
                onClick={() => pushParams({ range: chip.id, from: null, to: null, days: null })}
                aria-current={isActive ? "page" : undefined}
                className={`${SEG_ITEM} disabled:opacity-50 ${
                  isActive ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
                }`}
              >
                {zh ? chip.zh : chip.en}
              </button>
            );
          })}
          <button
            type="button"
            disabled={pending}
            onClick={() => setCustomOpen((value) => !value)}
            aria-expanded={customOpen}
            className={`${SEG_ITEM} disabled:opacity-50 ${
              applied.range === "custom" ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
            }`}
          >
            {zh ? "自定义" : "Custom"}
          </button>
        </nav>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 sm:hidden"
        >
          <SlidersHorizontal size={11} />
          {zh ? "筛选" : "Filters"}
          {activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        <div
          className={`${
            open ? "flex" : "hidden"
          } w-full flex-col gap-2 pt-1 sm:flex sm:w-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2 sm:pt-0`}
        >
          {primaryDimensions.map(renderDropdown)}
          {secondaryDimensions.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setMoreOpen((value) => !value)}
              aria-expanded={moreOpen}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 font-mono text-[11px] text-grey/80 transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 sm:min-h-9 sm:w-auto"
            >
              {moreOpen
                ? zh
                  ? "收起筛选"
                  : "Fewer filters"
                : zh
                  ? `更多筛选 +${secondaryDimensions.length}`
                  : `More filters +${secondaryDimensions.length}`}
              {secondaryActiveCount > 0 && (
                <span className="text-blue">· {secondaryActiveCount}</span>
              )}
            </button>
          )}
          {moreOpen && secondaryDimensions.map(renderDropdown)}
          {pending && (
            <span role="status" className="inline-flex min-h-11 items-center gap-1.5 font-mono text-[11px] text-grey sm:min-h-9">
              <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden="true" />
              {zh ? "正在更新…" : "Updating…"}
            </span>
          )}
        </div>
        {trailing && (
          <div className="flex items-center max-sm:w-full sm:ml-auto">{trailing}</div>
        )}
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
          <span className="font-mono text-[11px] text-grey">→</span>
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
            disabled={pending}
            className="min-h-11 rounded-lg border border-blue px-3 font-mono text-[11px] text-paper hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
          >
            {zh ? "应用" : "Apply"}
          </button>
          {customError && (
            <span className="font-mono text-[11px] text-red-400">
              {zh ? "需要 开始 ≤ 结束" : "From must be on or before To"}
            </span>
          )}
        </form>
      )}

      {/* 筛选结果分组(20260815 与作品/Awesome 同步):维度名每组一次(蓝),
          后接各选中值 token(可单个移除),Agent 维度带图标;组内值可换行。
          取代旧的「每条 chip 重复维度名 / 超 2 个折叠 ×N」模式。
          清除入口随行——移动端不展开筛选面板也能一键清除。 */}
      {activeCount > 0 && (
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          {activeSelections.map(({ dimension, selected }) => (
            <span
              key={dimension.key}
              className="flex min-h-11 max-w-full flex-wrap items-center gap-x-1 gap-y-1.5 rounded-lg border border-blue/40 bg-blue/10 pr-1 pl-3 font-mono text-[11px] sm:min-h-9"
            >
              <span className="shrink-0 text-blue">{dimension.label}</span>
              {selected.map((value) => {
                const rest = selected.filter((item) => item !== value);
                return (
                  <span
                    key={`${dimension.key}-${value}`}
                    className="flex min-h-7 items-center gap-1 rounded-md px-1.5 text-paper"
                  >
                    {dimension.withIcons && <AgentIcon id={value} size={12} />}
                    <span className="max-w-36 truncate">{chipLabel(dimension, value)}</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        pushParams({
                          [dimension.key]: rest.length > 0 ? rest.join(",") : null,
                        })
                      }
                      aria-label={zh ? `移除筛选 ${chipLabel(dimension, value)}` : `Remove filter ${chipLabel(dimension, value)}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-grey transition-colors hover:bg-blue/20 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 sm:size-6"
                    >
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </span>
          ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => pushParams({
              sources: null,
              models: null,
              efforts: null,
              agentVersions: null,
              projects: null,
              devices: null,
            })}
            className="min-h-11 px-2 font-mono text-[11px] text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 sm:min-h-9"
          >
            {zh ? "清除筛选" : "Clear filters"}
          </button>
        </div>
      )}
    </div>
  );
}
