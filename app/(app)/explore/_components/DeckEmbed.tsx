"use client";

/* Slides embed facade: the iframe (Kimi share links, exported HTML,
   PDFs) mounts only after an explicit press. External deck hosts are
   frequently slow or gone; an eagerly mounted frame then stalls the
   page's load event without contributing anything to first paint — the
   same trade VideoEmbed already makes for video players. The sandbox
   split travels with the iframe: PDFs stay unsandboxed (viewer plugins
   break under sandbox), other cross-origin frames keep their own origin
   (scripts/forms/popups run so interactive decks work) while still
   blocking top-navigation hijack; on-site paths run same-origin. */
import { useState } from "react";
import { Presentation } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function DeckEmbed({
  deck,
  title,
  locale,
}: {
  deck: string;
  title: string;
  locale: Locale;
}) {
  const [active, setActive] = useState(false);
  if (active) {
    const external = /^https?:\/\//i.test(deck);
    const isPdf = /\.pdf(\?|#|$)/i.test(deck);
    return (
      <iframe
        src={deck}
        title={title}
        sandbox={
          external && !isPdf
            ? "allow-scripts allow-popups allow-forms allow-same-origin"
            : undefined
        }
        className="h-[560px] w-full rounded-2xl border border-line bg-card"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      className="group flex h-[560px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-moon focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-blue text-white transition-transform group-hover:scale-105">
        <Presentation size={18} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col items-center gap-1 px-4">
        <span className="max-w-full truncate text-sm text-paper">{title}</span>
        <span className="font-mono text-xs tracking-[0.08em] text-grey">
          {t(locale, "explore.loadDeck")}
        </span>
      </span>
    </button>
  );
}
