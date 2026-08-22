"use client";

/* Detail-page gallery: the main view is the carousel — switch without
   zooming: arrows + counter + thumbnail clicks (active state,
   auto-scroll into view), horizontal swipe on mobile (40px threshold);
   clicking the big image opens a lightbox starting from the current
   one, closed by Esc/backdrop. Single-image works hide every switch
   control. key -> public URL goes through mediaUrl (the DB stores keys
   only, see the 20260826_work_media migration). */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { mediaUrl } from "@/src/lib/storage";

export default function WorkGallery({
  keys,
  name,
  locale,
  fit = "cover",
}: {
  keys: string[];
  name: string;
  locale: Locale;
  /* Cover fit: cover = crop-fill (default), contain = pad-to-fit
     (portrait images aren't cut at the waist). */
  fit?: string;
}) {
  /* The main view's current image; the lightbox image (null = closed),
     opening from the main view's current one. */
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);
  /* After a swipe the browser still fires a click — swallow it via the
     flag or the swipe would open the lightbox. */
  const swiped = useRef(false);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /* Thumbnails scroll into view only after a user switch: never on
     first render, so anchor/scroll-restoration entries don't drag page
     ancestors along with scrollIntoView. */
  const thumbMounted = useRef(false);

  const step = useCallback(
    (d: number) => {
      setActive((cur) => (cur + d + keys.length) % keys.length);
    },
    [keys.length],
  );
  const stepZoom = useCallback(
    (d: number) => {
      setZoom((cur) => (cur === null ? cur : (cur + d + keys.length) % keys.length));
    },
    [keys.length],
  );
  const closeZoom = useCallback(() => setZoom(null), []);

  /* While the lightbox is open: lock background scroll + arrow/Esc
     keys. */
  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeZoom();
      if (e.key === "ArrowLeft") stepZoom(-1);
      if (e.key === "ArrowRight") stepZoom(1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom, closeZoom, stepZoom]);

  /* The thumbnail strip auto-scrolls to the current image (user switches
     only; scrollbar-none container, affects itself alone). */
  useEffect(() => {
    if (!thumbMounted.current) {
      thumbMounted.current = true;
      return;
    }
    thumbRefs.current[active]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [active]);

  if (keys.length === 0) return null;
  const multi = keys.length > 1;

  /* Mobile swipe: one switch when the X delta crosses the threshold. */
  const onTouchStart = (e: React.TouchEvent) => {
    swiped.current = false;
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || !multi) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) {
      step(dx > 0 ? -1 : 1);
      swiped.current = true;
    }
    touchX.current = null;
  };
  /* The synthetic click after a swipe never opens the lightbox (see the
     swiped flag). */
  const openZoom = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    setZoom(active);
  };

  return (
    <div>
      {/* Main-view carousel: the large image opens the lightbox; arrows/counter overlay it (rendered for multi only) */}
      <div
        className="relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={openZoom}
          aria-label={t(locale, "works.galleryOpen")}
          className="block w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={keys[active]}
            src={mediaUrl(keys[active])}
            alt={`${name} ${active + 1}`}
            className={`aspect-video w-full rounded-2xl border border-line ${
              fit === "contain" ? "bg-moon object-contain" : "object-cover"
            }`}
          />
        </button>
        {multi && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t(locale, "works.galleryPrev")}
              className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t(locale, "works.galleryNext")}
              className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <ChevronRight size={20} />
            </button>
            <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 font-mono text-xs text-white/85">
              {active + 1} / {keys.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnails: click switches the main view (never opens the lightbox directly); the current one gets a blue ring */}
      {multi && (
        <div className="scrollbar-none mt-2 flex flex-nowrap gap-2 overflow-x-auto">
          {keys.map((k, i) => (
            <button
              key={k}
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              type="button"
              onClick={() => setActive(i)}
              aria-current={i === active ? "true" : undefined}
              aria-label={`${t(locale, "works.galleryOpen")} ${i + 1}`}
              className={`block shrink-0 cursor-pointer overflow-hidden rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                i === active
                  ? "border-blue"
                  : "border-line hover:border-ui-blue/50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(k)}
                alt={`${name} ${i + 1}`}
                loading="lazy"
                className="h-[70px] w-28 object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox: opens on the main view's current image; <-/-> paging, Esc or backdrop to close, counter included */}
      {zoom !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeZoom();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={closeZoom}
            aria-label={t(locale, "modal.close")}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
          {multi && (
            <>
              <button
                type="button"
                onClick={() => stepZoom(-1)}
                aria-label={t(locale, "works.galleryPrev")}
                className="absolute left-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => stepZoom(1)}
                aria-label={t(locale, "works.galleryNext")}
                className="absolute right-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          {/* Clicking the image itself does not dismiss (mis-taps concentrate on the image) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(keys[zoom])}
            alt={`${name} ${zoom + 1}`}
            className="max-h-[86vh] max-w-[92vw] rounded-xl border border-line object-contain"
          />
          {multi && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs text-white/70">
              {zoom + 1} / {keys.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
