"use client";

/* Multi-select filter dropdown for works/awesome (same interaction as
   the usage center's DimensionDropdown): selections stage locally and
   "apply" triggers exactly one server navigation; an empty set = the
   param is absent = unfiltered; outside click/Escape closes without
   submitting drafts. All filter state lives in the URL (shareable,
   refresh-safe). */
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import CheckboxControl from "@/components/CheckboxControl";

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

/* One dimension's multi-select dropdown; the button matches the usage
   page's chips (rounded-lg, grey label + values). */
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
  /* Single-select mode (scope): at most 1 draft; clicking the selected
     item again clears it (unfiltered); while selected the button shows
     the option's label, not a count. */
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
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 font-mono text-xs text-paper transition-colors hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50 sm:w-auto"
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
            <span className="font-mono text-xs text-grey">
              {zh ? "不勾选表示不限" : "No selection means any"}
            </span>
            <button
              type="button"
              onClick={() => setDraft([])}
              className="min-h-8 px-2 font-mono text-xs text-ui-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "不限" : "Any"}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-3 py-3 text-xs text-grey">
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
              className="min-h-8 px-3 font-mono text-xs text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={() => apply(draft)}
              className="min-h-8 rounded-lg border border-blue px-3 font-mono text-xs text-paper hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-40"
            >
              {zh ? "应用" : "Apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
