"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* 明细表的可选列(默认全关)。顺序即列选择器里的展示顺序;
   cols 参数的值从这里出,垃圾值由页面侧解析时丢弃。 */
const OPTIONAL_COLUMNS = [
  { id: "device", zh: "设备", en: "Device" },
  { id: "project", zh: "项目", en: "Project" },
  { id: "reasoning", zh: "推理", en: "Reasoning" },
  { id: "cacheWrite", zh: "缓存写", en: "Cache write" },
] as const;

/* 明细列选择器:勾选即写 cols 参数(空集 = 参数缺席 = 默认列)。
   不动 page(列显隐不影响分页),其余参数原样保留。 */
export default function RecordsColumnsMenu({
  enabled,
  preservedQuery,
  zh,
}: {
  enabled: string[];
  preservedQuery: string;
  zh: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: string) => {
    const next = OPTIONAL_COLUMNS.map((column) => column.id).filter(
      (columnId) =>
        columnId === id ? !enabled.includes(id) : enabled.includes(columnId),
    );
    const params = new URLSearchParams(preservedQuery);
    if (next.length > 0) params.set("cols", next.join(","));
    else params.delete("cols");
    const text = params.toString();
    router.push(text ? `/usage?${text}` : "/usage", { scroll: false });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 border border-line px-2.5 py-1.5 font-mono text-[10px] text-paper hover:border-blue"
      >
        {zh ? "列" : "Columns"}
        {enabled.length > 0 ? ` · ${enabled.length}` : ""}
        <ChevronDown size={11} className="text-grey" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 border border-line bg-moon">
          {OPTIONAL_COLUMNS.map((column) => (
            <label
              key={column.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-paper hover:bg-card"
            >
              <input
                type="checkbox"
                checked={enabled.includes(column.id)}
                onChange={() => toggle(column.id)}
                className="h-3.5 w-3.5 shrink-0 accent-blue"
              />
              <span className="min-w-0 truncate">{zh ? column.zh : column.en}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
