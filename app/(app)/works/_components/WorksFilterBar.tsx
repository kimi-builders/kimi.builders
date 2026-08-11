"use client";

/* 作品/Awesome 筛选条:若干多选下拉(FilterDropdown)+ 已选 chips 行(单个移除/一键清除)。
   状态全在 URL(agent/kind/scope 为 csv);改动只换参数,排序/其余参数原样保留。 */
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import FilterDropdown, { type FilterOption } from "./FilterDropdown";

export interface WorksFilterSpec {
  key: string;
  label: string;
  options: FilterOption[];
  /* 单选(收录口径):选中显示选项文案,draft 最多 1 个 */
  single?: boolean;
}

export default function WorksFilterBar({
  basePath,
  preservedQuery,
  filters,
  selected,
  zh,
}: {
  basePath: string;
  preservedQuery: string;
  filters: WorksFilterSpec[];
  selected: Record<string, string[]>;
  zh: boolean;
}) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const handleOpenChange = useCallback((id: string | null) => setOpenMenu(id), []);

  const pushParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(preservedQuery);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const text = params.toString();
    startTransition(() => {
      router.push(text ? `${basePath}?${text}` : basePath, { scroll: false });
    });
  };

  const labelOf = (key: string, value: string): string => {
    const spec = filters.find((f) => f.key === key);
    return spec?.options.find((o) => o.value === value)?.label ?? value;
  };
  const active = filters.flatMap((f) =>
    (selected[f.key] ?? []).map((value) => ({ key: f.key, label: f.label, value })),
  );

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <FilterDropdown
            key={f.key}
            paramKey={f.key}
            label={f.label}
            options={f.options}
            selected={selected[f.key] ?? []}
            basePath={basePath}
            preservedQuery={preservedQuery}
            open={openMenu === f.key}
            onOpenChange={handleOpenChange}
            single={f.single}
            zh={zh}
          />
        ))}
        {active.length > 0 && (
          <button
            type="button"
            onClick={() =>
              pushParams(Object.fromEntries(filters.map((f) => [f.key, null])))
            }
            className="min-h-9 px-2 font-mono text-[11px] text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {zh ? "清除筛选" : "Clear filters"}
          </button>
        )}
      </div>
      {active.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {active.map((item) => {
            const rest = (selected[item.key] ?? []).filter((v) => v !== item.value);
            return (
              <span
                key={`${item.key}-${item.value}`}
                className="flex max-w-full items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-paper"
              >
                <span className="shrink-0 text-grey">{item.label}</span>
                <span className="max-w-40 truncate">{labelOf(item.key, item.value)}</span>
                <button
                  type="button"
                  onClick={() =>
                    pushParams({ [item.key]: rest.length > 0 ? rest.join(",") : null })
                  }
                  aria-label={zh ? `移除筛选 ${labelOf(item.key, item.value)}` : `Remove filter ${labelOf(item.key, item.value)}`}
                  className="flex size-6 shrink-0 items-center justify-center text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
