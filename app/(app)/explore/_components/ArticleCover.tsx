"use client";

/* Article cover: shared by list row cards and the cover wall.
   payload.cover (on-site path or https image, falling back to the
   automatic brick on load failure). Two brick variants:
   - thumb (rows): the compact glyph brick (kind eyebrow + the chapter
     word; zh uses the single glyph, en spells LEARN/BUILD/GAIN/BECOME
     or MONTHLY/ARTICLE out — a bare "L"/"M" is unreadable out of
     context);
   - wall (grid cards, starters): the title renders on the brick (the
     Craft-style "cover is the artwork" composition) — kind eyebrow
     top-left, serif title, chapter word + duration on the bottom row.
   payload.coverTone picks the brick color (the same palette as work
   name bricks: fixed .work-tone-*, theme/default follows the theme via
   .work-cover-tile); texture hashes the slug — the same source as
   works hashing by name. Text rides currentColor, so every tone
   (including light-theme inversions) stays readable without overrides. */
import { useState } from "react";
import { coverTextureClass, coverToneClass } from "@/src/lib/cover-tones";
import type { ExploreItem } from "@/src/lib/explore";
import { exploreCoverText, findKbChapter } from "@/src/lib/kb-chapters";

export default function ArticleCover({
  item,
  zh,
  variant = "thumb",
}: {
  item: ExploreItem;
  zh: boolean;
  variant?: "thumb" | "wall";
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const chapter = item.chapter ? findKbChapter(item.chapter) : undefined;
  const copy = exploreCoverText(item.kind, chapter, zh);
  if (item.cover && !coverFailed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={item.cover}
        alt=""
        onError={() => setCoverFailed(true)}
        className="h-full w-full object-cover"
      />
    );
  }
  const toneCls = item.coverTone ? coverToneClass(item.coverTone) : null;
  const textureCls = coverTextureClass(item.slug);
  const eyebrowCls = `${toneCls ? "work-tone__eyebrow" : "work-cover-tile__eyebrow"}`;
  if (variant === "wall") {
    return (
      <div
        className={`${toneCls ?? "work-cover-tile"} ${textureCls ?? ""} relative flex h-full w-full flex-col justify-between p-4 text-left`}
      >
        {copy.eyebrow && (
          <span
            className={`${eyebrowCls} shrink-0 font-mono text-[10px] uppercase tracking-[0.14em]`}
          >
            {copy.eyebrow}
          </span>
        )}
        <span className="line-clamp-3 max-w-[36ch] text-balance font-human text-xl font-semibold leading-snug sm:text-2xl">
          {item.title}
        </span>
        <span className="flex shrink-0 items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
          <span>{chapter ? (zh ? chapter.zh : chapter.en) : ""}</span>
          {item.durationMin !== undefined && (
            <span>
              {item.durationMin} {zh ? "分钟" : "min"}
            </span>
          )}
        </span>
      </div>
    );
  }
  return (
    <div
      className={`${toneCls ?? "work-cover-tile"} ${textureCls ?? ""} flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center`}
    >
      {copy.eyebrow && (
        <span
          className={`${eyebrowCls} font-mono text-[10px] uppercase tracking-[0.14em]`}
        >
          {copy.eyebrow}
        </span>
      )}
      {copy.latin ? (
        /* en words at a smaller mono step with tracking — they sit in
           the glyph's slot without breaking the brick's composition
           (single words wrap only below the smallest card widths). */
        <span className="font-mono text-sm font-semibold uppercase leading-snug tracking-[0.22em]">
          {copy.word}
        </span>
      ) : (
        <span className="font-human text-4xl leading-none">{copy.word}</span>
      )}
    </div>
  );
}
