"use client";

/* 详情页配图图集:封面大图 + 等宽 16:10 缩略图;点击进灯箱(本页弹层:
   ←→ 翻页 / Esc 或背板点击关闭 / 计数),不再新开 tab。
   key → 公开 URL 由 mediaUrl 拼接(DB 只存 key,见 20260826_work_media 迁移)。 */
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { mediaUrl } from "@/src/lib/storage";

export default function WorkGallery({
  keys,
  name,
  locale,
}: {
  keys: string[];
  name: string;
  locale: Locale;
}) {
  const [active, setActive] = useState<number | null>(null);
  const close = useCallback(() => setActive(null), []);
  const step = useCallback(
    (d: number) => {
      setActive((cur) => (cur === null ? cur : (cur + d + keys.length) % keys.length));
    },
    [keys.length],
  );

  /* 灯箱打开时:锁背景滚动 + 键盘左右/Esc */
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active, close, step]);

  if (keys.length === 0) return null;
  const [cover, ...rest] = keys;
  const openAt = (index: number) => () => setActive(index);

  return (
    <div>
      <button
        type="button"
        onClick={openAt(0)}
        aria-label={t(locale, "works.galleryOpen")}
        className="block w-full cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(cover)}
          alt={name}
          className="aspect-video w-full rounded-2xl border border-line object-cover"
        />
      </button>
      {rest.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {rest.map((k, i) => (
            <button
              type="button"
              key={k}
              onClick={openAt(i + 1)}
              aria-label={`${t(locale, "works.galleryOpen")} ${i + 2}`}
              className="block cursor-zoom-in overflow-hidden rounded-lg border border-line transition-colors hover:border-blue"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(k)}
                alt={`${name} ${i + 2}`}
                loading="lazy"
                className="h-[70px] w-28 object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {active !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={close}
            aria-label={t(locale, "modal.close")}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
          {keys.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t(locale, "works.galleryPrev")}
                className="absolute left-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={t(locale, "works.galleryNext")}
                className="absolute right-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          {/* 点击图片本身不收起(误触多发生在图上) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(keys[active])}
            alt={`${name} ${active + 1}`}
            className="max-h-[86vh] max-w-[92vw] rounded-xl border border-line object-contain"
          />
          {keys.length > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs text-white/70">
              {active + 1} / {keys.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
