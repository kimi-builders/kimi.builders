"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  useEffect(() => {
    console.error(error);
  }, [error]);
  const locale: Locale = hydrated && document.documentElement.lang === "en" ? "en" : "zh";

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 py-16">
      <section className="w-full rounded-2xl border border-line bg-card p-6 shadow-xl shadow-bg/20 sm:p-10">
        <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-moon text-orange">
          <AlertTriangle size={24} aria-hidden="true" />
        </span>
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-orange">{t(locale, "state.errorEyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold text-paper">{t(locale, "state.errorTitle")}</h1>
        <p className="mt-3 max-w-lg text-sm leading-7 text-grey">{t(locale, "state.errorBody")}</p>
        {error.digest && <p className="mt-4 font-mono text-[11px] text-grey/60">Ref: {error.digest}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg bg-blue px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90">
            <RefreshCw size={15} aria-hidden="true" />
            {t(locale, "state.retry")}
          </button>
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 font-mono text-xs text-grey transition-colors hover:border-blue hover:text-paper">
            <Home size={15} aria-hidden="true" />
            {t(locale, "state.backHome")}
          </Link>
        </div>
      </section>
    </main>
  );
}
