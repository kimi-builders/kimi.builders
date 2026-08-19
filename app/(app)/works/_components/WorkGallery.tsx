"use client";

/* 详情页配图图集(P0 轮播改造 20260815):主视图即轮播——不放大就能切换:
   左右箭头 + 计数器 + 缩略图点击切换(带激活态、自动滚入视野),
   移动端手势横滑(阈值 40px);点大图进灯箱看细节,灯箱从当前张打开,
   Esc/背板关闭。单图作品所有切换控件退场。
   key → 公开 URL 由 mediaUrl 拼接(DB 只存 key,见 20260826_work_media 迁移)。 */
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
  /* 封面适配(20260908):cover=裁切填满(默认),contain=补边完整(竖屏图不拦腰裁) */
  fit?: string;
}) {
  /* 主视图当前张;灯箱张(null = 关),打开时从主视图当前张起 */
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);
  /* 横滑切图后浏览器仍会派发一次 click——标记吞掉,否则滑完即误开灯箱 */
  const swiped = useRef(false);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /* 缩略图滚入视野只在用户切换后执行:首渲染不滚,避免带锚点/滚动恢复进入时
     scrollIntoView 连带滚动页面祖先(20260816 修复) */
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

  /* 灯箱打开时:锁背景滚动 + 键盘左右/Esc */
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

  /* 缩略图行自动滚到当前张(仅在用户切换后;scrollbar-none 容器,只影响自身) */
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

  /* 移动端横滑:起止 X 差超过阈值判一次切换 */
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
  /* 横滑后的合成 click 不开灯箱(见 swiped 标记) */
  const openZoom = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    setZoom(active);
  };

  return (
    <div>
      {/* 主视图轮播:大图可点进灯箱;箭头/计数器叠加其上(multi 才渲染) */}
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

      {/* 缩略图:点击切换主视图(不再直接进灯箱);当前张蓝色描边 */}
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

      {/* 灯箱:从主视图当前张打开;←→ 翻页 / Esc 或背板关闭 / 计数 */}
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
          {/* 点击图片本身不收起(误触多发生在图上) */}
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
