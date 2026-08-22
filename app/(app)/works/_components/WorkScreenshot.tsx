"use client";

/* Shared media fallback for lists and detail. Cover semantics: the
   first gallery image; without one, fall back to the legacy
   screenshot_url external link; without that, the "name brick" — a
   unified generated cover: kind icon + tags top-left, the product name
   in Title Case centered, an uploaded logo above the name; base color
   from .work-cover-tile (theme-following) or .work-tone-* (fixed,
   globals.css, dual-theme responsive). No gradient fake material.
   variant: row = the row card's left column (aspect-video on mobile,
   full column height cropped at sm+); grid = grid card (fixed
   aspect-video); standalone = detail page. fit: cover = crop-fill
   (default), contain = pad-to-fit (portrait images aren't cut at the
   waist). The hover zoom rides group-hover — cards carrying group zoom
   the cover slightly; without a group ancestor (detail page) it's
   inert. */
import { useState } from "react";
import WorkKindIcon from "@/components/WorkKindIcon";
import { coverTextureClass, coverToneClass } from "@/src/lib/cover-tones";

/* Title Case: capitalize each Latin word's first letter, keep the rest
   as-is (preserving established camel case like KimiClaw;
   kimi-mcp-server -> Kimi-Mcp-Server). */
function titleCase(s: string): string {
  return s.replace(/[A-Za-z][A-Za-z0-9]*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

export default function WorkScreenshot({
  url,
  name,
  logoUrl = "",
  kindLabel = "",
  kindId = "",
  tone = "theme",
  fit = "cover",
  embedded = false,
  variant = "standalone",
}: {
  url: string;
  name: string;
  logoUrl?: string;
  kindLabel?: string;
  kindId?: string;
  tone?: string;
  fit?: string;
  embedded?: boolean;
  /* row = the row card's left column (full height at sm+); grid = grid
     card; standalone = detail page. */
  variant?: "row" | "grid" | "standalone";
}) {
  const [failed, setFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const mediaCls =
    variant === "row"
      ? "aspect-video sm:aspect-auto sm:h-full sm:min-h-36"
      : "aspect-video";
  const hoverCls = "transition-transform duration-base group-hover:scale-[1.03]";
  if (!url || failed) {
    /* Name brick: fixed tones = .work-tone-* (CSS, dual-theme, cool
       white / tone-deep text); theme = .work-cover-tile (deep space /
       site white, following the theme); texture variants hash the
       product name (coverTextureClass), giving roughly half the bricks
       a fine grid. */
    const toneCls = coverToneClass(tone);
    const textureCls = coverTextureClass(name);
    return (
      <div
        className={`relative flex w-full items-center justify-center ${
          toneCls ?? "work-cover-tile"
        } ${textureCls ?? ""} ${mediaCls} ${hoverCls} ${embedded ? "" : "rounded-2xl border border-line"}`}
      >
        {kindLabel && (
          <span
            className={`absolute left-3.5 top-3 z-[1] flex items-center gap-1 font-mono text-xs uppercase tracking-[0.08em] ${
              toneCls ? "work-tone__eyebrow" : "work-cover-tile__eyebrow"
            }`}
          >
            {kindId && <WorkKindIcon id={kindId} size={11} />}
            {kindLabel}
          </span>
        )}
        <span className="relative z-[1] flex flex-col items-center gap-2 px-4 pt-4 text-center">
          {logoUrl && !logoFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              onError={() => setLogoFailed(true)}
              className={`size-9 shrink-0 rounded-lg border object-cover ${
                toneCls ? "work-tone__logo" : "border-line"
              }`}
            />
          )}
          <span className="line-clamp-2 break-words font-mono text-sm font-medium leading-snug">
            {titleCase(name)}
          </span>
        </span>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={name}
      onError={() => setFailed(true)}
      className={`${mediaCls} w-full ${hoverCls} ${
        fit === "contain" ? "bg-moon object-contain" : "object-cover"
      } ${embedded ? "" : "rounded-2xl border border-line"}`}
    />
  );
}
