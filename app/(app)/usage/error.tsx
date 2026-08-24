"use client";

/* Usage route error boundary (client component): locale follows
   <html lang> via the hydration-safe read from the root app/error.tsx
   (the server-only getLocale is unavailable here); copy lives in DICT
   (usageErr.*). */
import { useEffect, useSyncExternalStore } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function UsageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  useEffect(() => {
    console.error("usage route boundary", error);
  }, [error]);
  const locale: Locale = hydrated && document.documentElement.lang === "en" ? "en" : "zh";
  return (
    <section className="border border-status-danger/40 bg-card p-6">
      <TriangleAlert size={20} className="text-status-danger-fg" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-semibold text-paper">
        {t(locale, "usageErr.title")}
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-grey">
        {t(locale, "usageErr.body")}
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-grey">{error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex min-h-11 items-center gap-2 border border-line px-4 font-mono text-xs text-paper hover:border-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <RefreshCw size={14} aria-hidden="true" /> {t(locale, "usageErr.retry")}
      </button>
    </section>
  );
}
