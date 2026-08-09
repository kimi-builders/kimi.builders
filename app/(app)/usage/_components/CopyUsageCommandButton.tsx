"use client";

import { Check, Clipboard, TriangleAlert } from "lucide-react";
import { useState } from "react";

export default function CopyUsageCommandButton({ command, zh }: { command: string; zh: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
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
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 border-l border-line px-3 font-mono text-[11px] text-grey hover:bg-card hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
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
