"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default function UsageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("usage route boundary", error);
  }, [error]);
  return (
    <section className="border border-red-500/40 bg-card p-6">
      <TriangleAlert size={20} className="text-red-400" aria-hidden="true" />
      <h1 className="mt-4 font-mono text-base font-semibold text-paper">
        用量中心暂时无法加载 / Usage center unavailable
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-grey">
        请求没有修改你的数据。请重试；如果问题持续出现，可将下方错误编号发给维护者。
        Your data was not changed. Retry, or send the error reference to the maintainer.
      </p>
      {error.digest && <p className="mt-3 font-mono text-[10px] text-grey">{error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex min-h-11 items-center gap-2 border border-line px-4 font-mono text-xs text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <RefreshCw size={14} aria-hidden="true" /> 重新加载 / Retry
      </button>
    </section>
  );
}
