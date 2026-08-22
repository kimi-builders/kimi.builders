"use client";

/* Article cover: shared by list row cards and the cover wall.
   payload.cover (on-site path or https image, falling back to the
   automatic brick on load failure); default = the automatic chapter
   brick (kind eyebrow + a large serif chapter glyph; letters use the
   issue glyph). payload.coverTone picks the brick color (the same
   palette as work name bricks: fixed .work-tone-*, theme/default
   follows the theme via .work-cover-tile); texture hashes the slug —
   the same source as works hashing by name. */
import { useState } from "react";
import { coverTextureClass, coverToneClass } from "@/src/lib/cover-tones";
import type { ExploreItem } from "@/src/lib/explore";
import { findKbChapter } from "@/src/lib/kb-chapters";

export default function ArticleCover({
  item,
  zh,
}: {
  item: ExploreItem;
  zh: boolean;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const chapter = item.chapter ? findKbChapter(item.chapter) : undefined;
  const kindText =
    item.kind === "letter" ? (zh ? "月刊评鉴" : "MONTHLY") : zh ? "文章" : "ARTICLE";
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
  return (
    <div
      className={`${toneCls ?? "work-cover-tile"} ${textureCls ?? ""} flex h-full w-full flex-col items-center justify-center gap-1.5`}
    >
      <span
        className={`${toneCls ? "work-tone__eyebrow" : "work-cover-tile__eyebrow"} font-mono text-[10px] uppercase tracking-[0.14em]`}
      >
        {kindText}
      </span>
      <span className="font-human text-4xl leading-none">
        {chapter ? (zh ? chapter.zh : chapter.en[0]) : zh ? "刊" : "M"}
      </span>
    </div>
  );
}
