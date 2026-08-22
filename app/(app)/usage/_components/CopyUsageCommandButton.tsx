"use client";

import { Check, Clipboard, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function CopyUsageCommandButton({ command, zh }: { command: string; zh: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  /* The state falls back to copyable after 1.6s: "copied" doesn't
     stay — the button can be clicked again. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 1600);
  }

  const label = status === "copied"
    ? zh ? "已复制" : "Copied"
    : status === "failed"
      ? zh ? "复制失败" : "Copy failed"
      : zh ? "复制" : "Copy";

  return (
    <button
      type="button"
      onClick={copyCommand}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 border-l border-line px-3 font-mono text-xs text-grey hover:bg-card hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      aria-label={label}
    >
      {status === "copied" ? (
        <Check size={15} aria-hidden="true" />
      ) : status === "failed" ? (
        <TriangleAlert size={15} aria-hidden="true" />
      ) : (
        <Clipboard size={15} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only" aria-live="polite">{status === "idle" ? "" : label}</span>
    </button>
  );
}
