"use client";

/* 作品/Awesome 筛选条:若干多选下拉(FilterDropdown)+ 已选分组 + 一键清除。
   状态全在 URL(agent/kind/scope 为 csv);改动只换参数,排序/其余参数原样保留。
   单行流式(20260815 修复):已选项与下拉同处一个 flex-wrap 行——此前已选
   chips 单独渲染成第二行,应用/清除筛选时行数增减,整条工具行长高 ~42px,
   把下方列表往下推,同行的排序 seg 与视图切换也被迫重新居中错位。
   分组呈现(20260815 二次打磨):维度名(参与构建 Agent/类型)每组只出现一次,
   后接各选中值 token(可单个移除),不再每条重复前缀;Agent 值带选项图标
   (icon 由 works/awesome 页面的筛选配置提供)。
   规格统一(20260815):已选分组与下拉按钮同高同弧度
   (min-h-11 sm:min-h-9 + rounded-lg,见 seg-classes.ts 注释)。 */
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { t, type Locale } from "@/src/lib/i18n";
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
  locale,
}: {
  basePath: string;
  preservedQuery: string;
  filters: WorksFilterSpec[];
  selected: Record<string, string[]>;
  locale: Locale;
}) {
  const zh = locale === "zh";
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

  const activeCount = filters.reduce(
    (n, f) => n + (selected[f.key] ?? []).length,
    0,
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
        {filters.map((f) => {
          const values = selected[f.key] ?? [];
          if (values.length === 0) return null;
          return (
            <span
              key={`${f.key}-group`}
              className="flex min-h-11 max-w-full items-center gap-1 rounded-lg border border-blue/40 bg-blue/10 pr-1 pl-3 font-mono text-[11px] sm:min-h-9"
            >
              <span className="shrink-0 text-grey">{f.label}</span>
              {values.map((value) => {
                const option = f.options.find((o) => o.value === value);
                const label = option?.label ?? value;
                const rest = values.filter((v) => v !== value);
                return (
                  <span
                    key={value}
                    className="flex min-h-7 items-center gap-1 rounded-md px-1.5 text-paper"
                  >
                    {option?.icon}
                    <span className="max-w-36 truncate">{label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        pushParams({
                          [f.key]: rest.length > 0 ? rest.join(",") : null,
                        })
                      }
                      aria-label={t(locale, "works.removeFilter", { name: label })}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-grey transition-colors hover:bg-blue/20 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:size-6"
                    >
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </span>
          );
        })}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              pushParams(Object.fromEntries(filters.map((f) => [f.key, null])))
            }
            className="min-h-11 px-2 font-mono text-[11px] text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-9"
          >
            {t(locale, "works.clearFilters")}
          </button>
        )}
      </div>
    </div>
  );
}
