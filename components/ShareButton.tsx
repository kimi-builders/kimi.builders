"use client";

/* Share button: copies the post link (with title) to the clipboard; on
   success the icon checks for 2 seconds. Client-only: needs
   navigator.clipboard and window.location.origin. Optional posterHref:
   when present adds a small "poster" button opening the poster PNG in a
   new tab (?download=1 downloads directly via the attachment header);
   absent, behavior is unchanged. */
import { useState } from "react";
import { Check, ImageDown, Share2 } from "lucide-react";
import {
  trackBeacon,
  type PosterSurface,
} from "@/app/(app)/_components/track";
import { t, type Locale } from "@/src/lib/i18n";

export default function ShareButton({
  path,
  title,
  locale,
  posterHref,
  posterSurface,
}: {
  path: string;
  title: string;
  locale: Locale;
  posterHref?: string;
  posterSurface?: PosterSurface;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-4">
      <button
        type="button"
        aria-label={t(locale, "post.shareAria")}
        onClick={async () => {
          const url = `${window.location.origin}${path}`;
          try {
            await navigator.clipboard.writeText(`${title} ${url}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* A rejected clipboard (permissions/insecure context) stays
               silent — never disturb the reading. */
          }
        }}
        className={`inline-flex items-center gap-1.5 font-mono text-xs transition-colors ${
          copied ? "text-ui-blue" : "text-grey hover:text-ui-blue"
        }`}
      >
        {copied ? <Check size={14} /> : <Share2 size={14} />}
        <span>{t(locale, copied ? "post.copied" : "post.share")}</span>
      </button>
      {posterHref && (
        <button
          type="button"
          aria-label={t(locale, "post.posterAria")}
          onClick={() => {
            if (posterSurface) {
              trackBeacon({
                event: "poster_download",
                target_kind: "surface",
                target_id: posterSurface,
                meta: { surface: posterSurface },
              });
            }
            window.open(
              `${posterHref}${posterHref.includes("?") ? "&" : "?"}download=1`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-grey transition-colors hover:text-ui-blue"
        >
          <ImageDown size={14} />
          <span>{t(locale, "post.poster")}</span>
        </button>
      )}
    </span>
  );
}
