"use client";

/* In-app route loading state: mounted on the (app) group's loading
   boundary — the three-column shell (top/left/right) keeps its face
   during soft navigation and only the main column enters the loading
   state, replacing the old root-level BrandLoading full-page swap that
   flashed a fullscreen logo. Same visual family as BrandLoading (small
   tile mark + LOADING.) at in-column component density; first visits
   and direct URLs still hit the root-level BrandLoading poster via the
   outer boundary. Slow-load self-help: past 5s a "retry" appears
   (router.refresh re-fetches the route) — the loading state is never a
   dead end. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function RouteLoading({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-tile.svg"
        alt="kimi.builders"
        className="h-12 w-12 rounded-lg"
      />
      <p className="mt-5 font-mono text-xs tracking-[0.08em] text-grey">
        LOADING<span className="text-ui-blue">.</span>
      </p>
      {slow && (
        <div className="mt-6 flex flex-col items-center gap-2.5">
          <p className="text-xs leading-relaxed text-grey">{t(locale, "load.slow")}</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 font-mono text-xs text-paper transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <RefreshCw size={13} aria-hidden="true" />
            {t(locale, "state.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
