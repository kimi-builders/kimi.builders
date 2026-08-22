"use client";

/* Works/Awesome filter bar: multi-select dropdowns (FilterDropdown) + a
   grouped results row + clear-all. State lives entirely in the URL
   (agent/kind/scope as csv); a change swaps only its own param — sort
   and the rest survive. Two-row structure:
   - the dropdown row is permanent and stays on one line with the page's
     sort seg (the toolbar is items-start aligned) — however many
     selections, dropdown buttons never wrap and the tool slots stay
     fixed;
   - the results row appears only with selections: groups wrap between,
     values wrap within (flex-wrap), dimension names in blue to tell them
     from values, clear-all rides along.
   Grouped display: a dimension name appears once, followed by its value
   tokens (individually removable); agent values carry option icons
   (icons come from the works/awesome filter config). Sizing is unified:
   dropdowns and groups share height and radius (min-h-11 sm:min-h-9 +
   rounded-lg, see the seg-classes.ts comment). */
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import FilterDropdown, { type FilterOption } from "./FilterDropdown";

export interface WorksFilterSpec {
  key: string;
  label: string;
  options: FilterOption[];
  /* Single-select (scope): shows the option label, at most 1 draft. */
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

  /* The two rows join the page toolbar flex as siblings: the results
     row takes order-last + w-full — a full row under the toolbar, its
     left edge aligned with the sort seg (hot/new) — no longer squeezed
     inside the dropdown row, removing the blank band under the seg. */
  return (
    <>
      {/* 下拉行:移动端整条工具行里排到末尾、占满整行,下拉 w-full 逐行
          堆叠(对齐用量中心的筛选排版);桌面 order-none + flex-1 回到
          排序 seg 之后的行内位置,多选再多也不随结果换行——工具位恒定。 */}
      <div className="order-last min-w-0 w-full sm:order-none sm:w-auto sm:flex-1">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
        </div>
      </div>
      {/* 结果行:order-last + w-full 独占工具行下一整行,左缘与排序 seg
          (热门/最新)对齐——不缩在下拉行内部,消除 seg 下方的空白带。 */}
      {activeCount > 0 && (
        <div className="order-last flex w-full flex-wrap items-start gap-2">
          {filters.map((f) => {
            const values = selected[f.key] ?? [];
            if (values.length === 0) return null;
            return (
              <span
                key={`${f.key}-group`}
                className="flex min-h-11 max-w-full flex-wrap items-center gap-x-1 gap-y-1.5 rounded-lg border border-blue/40 bg-blue/10 pr-1 pl-3 font-mono text-xs"
              >
                <span className="shrink-0 text-ui-blue">{f.label}</span>
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
          <button
            type="button"
            onClick={() =>
              pushParams(Object.fromEntries(filters.map((f) => [f.key, null])))
            }
            className="min-h-11 px-2 font-mono text-xs text-ui-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "works.clearFilters")}
          </button>
        </div>
      )}
    </>
  );
}
