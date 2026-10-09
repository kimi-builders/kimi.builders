"use client";

/* Preset cover picker: one row of official-artwork thumbnails under the
   cover field. Selecting a thumb writes the gallery src into the
   caller's cover value (articles: payload.cover string; works:
   MediaRef.key) — this component owns no state. The "clear" affordance
   only shows while a gallery pick is active (uploaded covers are
   cleared by their own remove button). */
import { COVER_GALLERY } from "@/src/lib/cover-gallery";
import { X } from "lucide-react";

export default function CoverGalleryPicker({
  value,
  onPick,
  onClear,
  zh,
}: {
  /* Current cover value ("" / null = none). */
  value: string;
  onPick: (src: string) => void;
  onClear?: () => void;
  zh: boolean;
}) {
  const active = value.startsWith("/covers/");
  return (
    <div>
      <span className="mb-1.5 block text-xs text-grey">
        {zh ? "官方图库（点选即用）" : "Official gallery (click to apply)"}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {COVER_GALLERY.map((cover) => (
          <button
            key={cover.id}
            type="button"
            onClick={() => onPick(cover.src)}
            aria-pressed={value === cover.src}
            aria-label={zh ? cover.zh : cover.en}
            title={zh ? cover.zh : cover.en}
            className={`h-12 w-[4.5rem] overflow-hidden rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              value === cover.src
                ? "border-blue"
                : "border-line hover:border-paper/30"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.src}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
        {active && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={12} aria-hidden="true" /> {zh ? "清除封面" : "Clear cover"}
          </button>
        )}
      </div>
    </div>
  );
}
