"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import CheckboxControl from "@/components/CheckboxControl";

/* Optional columns for the records table (all off by default). Order
   is the picker's display order; the cols param's values come from
   here, garbage dropped at the page's parse. */
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

/* Records column picker: checking writes the cols param (empty set =
   param absent = default columns). page stays untouched (column
   visibility doesn't affect paging); other params survive. */
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
        /* Dropped the sm:min-h-9 desktop downgrade — level with the
           h-11 seg controls at 44px; the old 36px sat a notch short
           (the records header's day/30-min + columns row misaligned). */
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 font-mono text-xs text-paper hover:border-paper/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
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
              <CheckboxControl
                checked={enabled.includes(column.id)}
                onChange={() => toggle(column.id)}
              />
              <span className="min-w-0 truncate">{zh ? column.zh : column.en}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
