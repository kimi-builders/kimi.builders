"use client";

/* 图片裁剪弹层(从 WorkMediaFields 的 Logo 裁剪抽出,头像/Logo 共用;
   20260919 泛化 aspect:宽/高比,默认 1 = 正方形(头像/Logo),
   作品封面传 16/9):拖动定位 + 滑杆缩放,canvas 导出 PNG。
   文案全部由调用方以 props 传入(各自走自己的 i18n key),组件本身不绑字典。 */
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, ZoomIn } from "lucide-react";

/* 视口宽固定,高随 aspect(1 = 320²);图片 cover 适配为基准缩放(zoom=1),
   滑杆最多再放 4 倍;变换只记 (scale, offset),导出时换算回源图裁剪矩形。 */
const CROP_VIEW = 320;
const ZOOM_MAX = 4;
/* 导出长边:正方形保持历史行为 512(头像/Logo);非正方形取 1024
   (封面 16:9 → 1024×576,列表展示足够) */
function outSize(aspect: number): { w: number; h: number } {
  const long = aspect === 1 ? 512 : 1024;
  return aspect >= 1
    ? { w: long, h: Math.round(long / aspect) }
    : { w: Math.round(long * aspect), h: long };
}

export default function ImageCropDialog({
  img,
  src,
  aspect = 1,
  title,
  hint,
  zoomLabel,
  cancelLabel,
  applyLabel,
  busyLabel,
  errorLabel,
  onCancel,
  onApply,
}: {
  img: HTMLImageElement;
  src: string;
  /* 裁剪框宽/高比,默认 1(正方形);封面传 16/9 */
  aspect?: number;
  title: string;
  hint: string;
  zoomLabel: string;
  cancelLabel: string;
  applyLabel: string;
  busyLabel: string;
  errorLabel: string;
  onCancel: () => void;
  onApply: (blob: Blob) => Promise<void>;
}) {
  const viewW = CROP_VIEW;
  const viewH = Math.round(CROP_VIEW / aspect);
  /* cover 适配:短边贴满视口 */
  const base = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
  const [zoom, setZoom] = useState(1);
  const scale = base * zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const clamp = (o: { x: number; y: number }, nw: number, nh: number) => ({
    x: Math.min(0, Math.max(viewW - nw, o.x)),
    y: Math.min(0, Math.max(viewH - nh, o.y)),
  });
  const [offset, setOffset] = useState(() =>
    clamp(
      { x: (viewW - img.naturalWidth * base) / 2, y: (viewH - img.naturalHeight * base) / 2 },
      img.naturalWidth * base,
      img.naturalHeight * base,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  /* Esc 取消(上传中忽略,避免状态撕裂) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  /* 缩放以视口中心为锚:中心指向的图点不动 */
  const applyZoom = (z: number) => {
    const ns = base * z;
    const nw = img.naturalWidth * ns;
    const nh = img.naturalHeight * ns;
    const fx = (viewW / 2 - offset.x) / w;
    const fy = (viewH / 2 - offset.y) / h;
    setOffset(clamp({ x: viewW / 2 - fx * nw, y: viewH / 2 - fy * nh }, nw, nh));
    setZoom(z);
  };

  const confirm = async () => {
    const out = outSize(aspect);
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    /* 视口可见区域 → 源图裁剪矩形 */
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sw = viewW / scale;
    const sh = viewH / scale;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.w, out.h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    setBusy(true);
    setFailed(false);
    try {
      await onApply(blob);
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-fit max-w-full rounded-2xl border border-line bg-bg p-5 text-paper shadow-2xl">
        <h3 className="font-mono text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-grey">{hint}</p>
        {/* 裁剪视口:指针拖动定位(touch-none 让 pointer 事件接管触屏拖动) */}
        <div
          className="relative mt-4 touch-none select-none overflow-hidden rounded-lg border border-line"
          style={{ width: viewW, height: viewH, maxWidth: "100%" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const d = drag.current;
            setOffset(
              clamp(
                { x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py },
                w,
                h,
              ),
            );
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{
              width: w,
              height: h,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          <span className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/25" />
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-grey">
          <ZoomIn size={14} aria-hidden="true" />
          <span className="sr-only">{zoomLabel}</span>
          <input
            type="range"
            min={1}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-blue"
            aria-label={zoomLabel}
          />
        </label>
        {failed && (
          <p role="alert" className="mt-3 text-xs text-blue">
            {errorLabel}
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue bg-blue px-4 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
          >
            {busy ? (
              <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Check size={13} aria-hidden="true" />
            )}
            {busy ? busyLabel : applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
