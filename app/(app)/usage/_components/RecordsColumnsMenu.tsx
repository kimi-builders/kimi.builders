"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/* 明细表的可选列(默认全关)。顺序即列选择器里的展示顺序;
   cols 参数的值从这里出,垃圾值由页面侧解析时丢弃。 */
export const OPTIONAL_RECORD_COLUMNS = [
  { id: "device", zh: "设备", en: "Device" },
  { id: "project", zh: "项目", en: "Project" },
  { id: "reasoning", zh: "推理", en: "Reasoning" },
  { id: "effort", zh: "推理强度", en: "Effort" },
  { id: "agentVersion", zh: "Agent 版本", en: "Agent version" },
  { id: "modelProvider", zh: "模型供应方", en: "Model provider" },
  { id: "cacheWrite", zh: "缓存写", en: "Cache write" },
] as const;

export type OptionalRecordColumn = (typeof OPTIONAL_RECORD_COLUMNS)[number]["id"];

/* 明细列选择器:勾选即写 cols 参数(空集 = 参数缺席 = 默认列)。
   不动 page(列显隐不影响分页),其余参数原样保留。 */
export default function RecordsColumnsMenu({
  enabled,
  onChange,
  zh,
}: {
  enabled: OptionalRecordColumn[];
  onChange: (columns: OptionalRecordColumn[]) => void;
  zh: boolean;
}) {
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
    const next = OPTIONAL_RECORD_COLUMNS.map((column) => column.id).filter(
      (columnId) =>
        columnId === id ? !enabled.includes(id) : enabled.includes(columnId),
    );
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 font-mono text-[11px] text-paper hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-9"
      >
        {zh ? "列" : "Columns"}
        {enabled.length > 0 ? ` · ${enabled.length}` : ""}
        <ChevronDown size={11} className="text-grey" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-moon shadow-xl">
          {OPTIONAL_RECORD_COLUMNS.map((column) => (
            <label
              key={column.id}
              className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs text-paper hover:bg-card"
            >
              <input
                type="checkbox"
                checked={enabled.includes(column.id)}
                onChange={() => toggle(column.id)}
                className="size-4 shrink-0 accent-blue"
              />
              <span className="min-w-0 truncate">{zh ? column.zh : column.en}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
