"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UsageFilterOptions } from "@/src/lib/usage/query";
import { usageSourceLabel } from "@/src/lib/usage/labels";

interface AppliedFilters {
  range: string;
  sources?: string;
  models?: string;
  projects?: string;
  devices?: string;
}

/* 筛选栏:范围 chips + 四个单选下拉。所有状态都写在 URL 上(可分享/可刷新),
   任何筛选变化把 page 重置回 1,metric 等其他参数原样保留。 */
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

  const buildHref = (changes: Record<string, string | null>): string => {
    const params = new URLSearchParams(preservedQuery);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const text = params.toString();
    return text ? `/usage?${text}` : "/usage";
  };

  const pushFilter = (key: string, value: string) => {
    router.push(buildHref({ [key]: value || null, page: null }), { scroll: false });
  };

  const active: { key: string; label: string; value: string }[] = [];
  if (applied.sources) active.push({ key: "sources", label: zh ? "工具" : "Source", value: applied.sources });
  if (applied.models) active.push({ key: "models", label: zh ? "模型" : "Model", value: applied.models });
  if (projectsEnabled && applied.projects) {
    active.push({ key: "projects", label: zh ? "项目" : "Project", value: applied.projects });
  }
  if (applied.devices) active.push({ key: "devices", label: zh ? "设备" : "Device", value: applied.devices });
  const activeCount = active.length;

  const renderSelect = (
    key: string,
    label: string,
    entries: { value: string; label: string }[],
    appliedValue: string | undefined,
  ) => {
    /* 已选值可能不在候选里(如手工拼的 URL),补一项保证选中态可见。 */
    const items =
      appliedValue && !entries.some((entry) => entry.value === appliedValue)
        ? [{ value: appliedValue, label: appliedValue }, ...entries]
        : entries;
    return (
      <label className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 font-mono text-[10px] text-grey">{label}</span>
        <select
          value={appliedValue ?? ""}
          onChange={(event) => pushFilter(key, event.target.value)}
          aria-label={label}
          className="max-w-[10rem] min-w-0 border border-line bg-bg px-2 py-1.5 font-mono text-[11px] text-paper outline-none focus:border-blue"
        >
          <option value="">{zh ? "全部" : "All"}</option>
          {items.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="mt-5 border-b border-line pb-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label={zh ? "时间范围" : "Date range"} className="flex items-center gap-1">
          {[7, 30, 90].map((days) => {
            const value = `${days}d`;
            const isActive = applied.range === value;
            return (
              <a
                key={days}
                href={buildHref({ range: value, from: null, to: null, page: null })}
                aria-current={isActive ? "page" : undefined}
                className={`px-3 py-1.5 font-mono text-[11px] transition-colors ${
                  isActive ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
                }`}
              >
                {days}D
              </a>
            );
          })}
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
          } w-full flex-wrap items-center gap-x-4 gap-y-2 pt-1 sm:flex sm:w-auto sm:flex-1 sm:pt-0`}
        >
          {renderSelect(
            "sources",
            zh ? "工具" : "Tool",
            options.sources.map((id) => ({ value: id, label: usageSourceLabel(id) })),
            applied.sources,
          )}
          {renderSelect(
            "models",
            zh ? "模型" : "Model",
            options.models.map((model) => ({ value: model, label: model })),
            applied.models,
          )}
          {projectsEnabled &&
            renderSelect(
              "projects",
              zh ? "项目" : "Project",
              options.projects.map((project) => ({ value: project, label: project })),
              applied.projects,
            )}
          {renderSelect(
            "devices",
            zh ? "设备" : "Device",
            options.devices.map((device) => ({ value: device.id, label: device.name })),
            applied.devices,
          )}
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
      {activeCount > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {active.map((item) => (
            <span
              key={item.key}
              className="flex max-w-full items-center gap-1.5 border border-line px-2 py-1 font-mono text-[10px] text-paper"
            >
              <span className="shrink-0 text-grey">{item.label}</span>
              <span className="max-w-[10rem] truncate">{item.value}</span>
              <a
                href={buildHref({ [item.key]: null, page: null })}
                aria-label={zh ? `移除${item.label}筛选` : `Remove ${item.label} filter`}
                className="shrink-0 text-grey hover:text-paper"
              >
                <X size={10} />
              </a>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
