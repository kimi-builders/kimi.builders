"use client";

/* Tutorial video embed: platforms first — a Bilibili player / YouTube
   nocookie iframe, 16:9. Click-to-load facade: the iframe mounts only
   after an explicit press, so nothing autoplays on open (Bilibili's
   embedded player ignores autoplay=0 in some modes) and the ~1MB
   player never loads for readers who don't watch. The press doubles as
   play intent: the mounted iframe starts with autoplay=1. */
import { useState } from "react";
import { Play } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function VideoEmbed({
  provider,
  id,
  title,
  locale,
}: {
  provider: "bilibili" | "youtube";
  id: string;
  title: string;
  locale: Locale;
}) {
  const [active, setActive] = useState(false);
  if (active) {
    const src =
      provider === "bilibili"
        ? `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}&autoplay=1`
        : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`;
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-moon">
        <div className="relative aspect-video">
          <iframe
            src={src}
            title={title}
            loading="lazy"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-moon">
      <button
        type="button"
        onClick={() => setActive(true)}
        aria-label={t(locale, "video.play")}
        className="group relative flex aspect-video w-full flex-col items-center justify-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-blue text-white transition-transform group-hover:scale-105">
          <Play size={18} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col items-center gap-1 px-4">
          <span className="max-w-full truncate text-sm text-paper">{title}</span>
          <span className="font-mono text-xs tracking-[0.08em] text-grey">
            {provider === "bilibili" ? "BILIBILI" : "YOUTUBE"}
          </span>
        </span>
      </button>
    </div>
  );
}
