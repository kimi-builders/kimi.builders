"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default function UsageLoadErrorCard({
  reference,
  zh,
  compact = false,
}: {
  reference: string;
  zh: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={`${compact ? "p-4" : "p-5 sm:p-6"} border border-status-danger/40 bg-card`}>
      <div className="flex items-start gap-3">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-status-danger-fg" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-paper">
            {zh ? "这部分数据暂时加载失败。" : "This section could not be loaded."}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-grey">
            {zh
              ? "其他已成功加载的内容仍然保留。重试后若继续出现，请把错误编号发给维护者。"
              : "Other successfully loaded content remains available. If retrying does not help, send the error reference to the maintainer."}
          </p>
          <p className="mt-2 font-mono text-[11px] text-grey">{reference}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw size={13} className={pending ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
            {pending ? (zh ? "重试中…" : "Retrying…") : (zh ? "重新加载" : "Retry")}
          </button>
        </div>
      </div>
    </div>
  );
}
