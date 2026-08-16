"use client";

/* 作品/Awesome 的多选筛选下拉(用量中心 DimensionDropdown 同款交互):
   本地暂存勾选,点「应用」只触发一次服务端导航;空集 = 参数缺席 = 不限;
   外点/Escape 关闭且不会误提交草稿。所有筛选状态都在 URL 上(可分享/可刷新)。 */
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import CheckboxControl from "@/components/CheckboxControl";

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

/* 单维度多选下拉;按钮形态与用量页 chip 一致(rounded-lg,灰标签 + 值)。 */
export default function FilterDropdown({
  paramKey,
  label,
  options,
  selected,
  basePath,
  preservedQuery,
  open,
  onOpenChange,
  single = false,
  zh,
}: {
  paramKey: string;
  label: string;
  options: FilterOption[];
  selected: string[];
  basePath: string;
  preservedQuery: string;
  open: boolean;
  onOpenChange: (id: string | null) => void;
  /* 单选模式(收录口径):draft 最多 1 个,再点已选项 = 清空(不限);
     选中时按钮显示选项文案而不是数量 */
  single?: boolean;
  zh: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string[]>(selected);
  const [pending, startTransition] = useTransition();

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

  const apply = (values: string[]) => {
    const params = new URLSearchParams(preservedQuery);
    if (values.length > 0) params.set(paramKey, values.join(","));
    else params.delete(paramKey);
    const text = params.toString();
    onOpenChange(null);
    startTransition(() => {
      router.push(text ? `${basePath}?${text}` : basePath, { scroll: false });
    });
  };

  const toggle = (value: string) => {
    if (single) {
      setDraft((current) => (current.includes(value) ? [] : [value]));
      return;
    }
    setDraft((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value].slice(0, 12),
    );
  };
  const dirty = [...draft].sort().join(" ") !== [...selected].sort().join(" ");

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!open) setDraft(selected);
          onOpenChange(open ? null : paramKey);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 font-mono text-[11px] text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 sm:min-h-9 sm:w-auto"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-grey">{label}</span>
          <span className="truncate">
            {selected.length === 0
              ? zh
                ? "全部"
                : "All"
              : single
                ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
                : `· ${selected.length}`}
          </span>
        </span>
        {pending ? (
          <LoaderCircle size={11} className="shrink-0 motion-safe:animate-spin" />
        ) : (
          <ChevronDown size={11} className="shrink-0 text-grey" />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-moon shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="font-mono text-[11px] text-grey">
              {zh ? "不勾选表示不限" : "No selection means any"}
            </span>
            <button
              type="button"
              onClick={() => setDraft([])}
              className="min-h-8 px-2 font-mono text-[11px] text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "不限" : "Any"}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-grey">
                {zh ? "暂无可选项" : "No options"}
              </p>
            ) : (
              options.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-10 cursor-pointer items-center gap-2 px-3 text-xs text-paper transition-colors hover:bg-card"
                >
                  <CheckboxControl
                    checked={draft.includes(option.value)}
                    onChange={() => toggle(option.value)}
                  />
                  {option.icon}
                  <span className="min-w-0 truncate" title={option.label}>
                    {option.label}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line p-2">
            <button
              type="button"
              onClick={() => onOpenChange(null)}
              className="min-h-8 px-3 font-mono text-[11px] text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={() => apply(draft)}
              className="min-h-8 rounded-lg border border-blue px-3 font-mono text-[11px] text-paper hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-40"
            >
              {zh ? "应用" : "Apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
