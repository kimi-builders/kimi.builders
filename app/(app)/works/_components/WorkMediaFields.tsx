"use client";

/* 作品媒体字段(20260826_work_media):Logo(客户端裁剪后上传)+ 配图(≤9,第一张 = 封面)。
   仅「我的作品」路径渲染(WorkForm 按 kind 条件挂载);awesome 推荐条目不出现,
   服务端也强制置空。提交走隐藏字段:logoKey 单 key,imageKeys 为 key 的 JSON 数组;
   上传中/失败的配图不进隐藏字段(不提交半截状态)。
   上传统一打 POST /api/upload(kind=logo|image),裁剪/拖拽/排序全手写,无三方库。 */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  GripVertical,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  X,
  ZoomIn,
} from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { WORK_IMAGE_MAX } from "@/src/lib/work-media";

export interface MediaRef {
  key: string;
  url: string;
}

/* 配图条目:key 空 = 未上传完;file 留给失败重试。 */
interface ImageItem {
  id: number;
  key: string;
  url: string;
  status: "uploading" | "ok" | "error";
  file: File | null;
}

/* 上传到 /api/upload,失败抛错(调用方按条目标 error 态)。 */
async function uploadMedia(file: File | Blob, kind: "logo" | "image"): Promise<MediaRef> {
  const fd = new FormData();
  fd.set("kind", kind);
  fd.set("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    data?: { key: string; url: string };
  } | null;
  if (!res.ok || !data?.ok || !data.data) throw new Error(data?.error || "upload_failed");
  return { key: data.data.key, url: data.data.url };
}

/* ---- Logo 裁剪弹层:拖动定位 + 滑杆缩放,canvas 导出 512² PNG ----
   视口正方形,图片 cover 适配为基准缩放(zoom=1),滑杆最多再放 4 倍;
   变换只记 (scale, offset),导出时换算回源图裁剪矩形。 */
const CROP_VIEW = 320;
const CROP_OUT = 512;
const ZOOM_MAX = 4;

function LogoCropDialog({
  img,
  src,
  locale,
  onCancel,
  onApply,
}: {
  img: HTMLImageElement;
  src: string;
  locale: Locale;
  onCancel: () => void;
  onApply: (blob: Blob) => Promise<void>;
}) {
  /* cover 适配:短边贴满视口 */
  const base = Math.max(CROP_VIEW / img.naturalWidth, CROP_VIEW / img.naturalHeight);
  const [zoom, setZoom] = useState(1);
  const scale = base * zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const clamp = (o: { x: number; y: number }, nw: number, nh: number) => ({
    x: Math.min(0, Math.max(CROP_VIEW - nw, o.x)),
    y: Math.min(0, Math.max(CROP_VIEW - nh, o.y)),
  });
  const [offset, setOffset] = useState(() =>
    clamp(
      { x: (CROP_VIEW - img.naturalWidth * base) / 2, y: (CROP_VIEW - img.naturalHeight * base) / 2 },
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
    const fx = (CROP_VIEW / 2 - offset.x) / w;
    const fy = (CROP_VIEW / 2 - offset.y) / h;
    setOffset(clamp({ x: CROP_VIEW / 2 - fx * nw, y: CROP_VIEW / 2 - fy * nh }, nw, nh));
    setZoom(z);
  };

  const confirm = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUT;
    canvas.height = CROP_OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    /* 视口可见区域 → 源图裁剪矩形 */
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sw = CROP_VIEW / scale;
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, CROP_OUT, CROP_OUT);
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
      aria-label={t(locale, "works.logoCropTitle")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-fit max-w-full rounded-2xl border border-line bg-bg p-5 text-paper shadow-2xl">
        <h3 className="font-mono text-sm font-semibold">
          {t(locale, "works.logoCropTitle")}
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-grey">
          {t(locale, "works.logoCropHint")}
        </p>
        {/* 裁剪视口:指针拖动定位(touch-none 让 pointer 事件接管触屏拖动) */}
        <div
          className="relative mt-4 touch-none select-none overflow-hidden rounded-lg border border-line"
          style={{ width: CROP_VIEW, height: CROP_VIEW, maxWidth: "100%" }}
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
          <span className="sr-only">{t(locale, "works.logoZoom")}</span>
          <input
            type="range"
            min={1}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-blue"
            aria-label={t(locale, "works.logoZoom")}
          />
        </label>
        {failed && (
          <p role="alert" className="mt-3 text-xs text-red-400">
            {t(locale, "err.uploadFailed")}
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
          >
            {t(locale, "post.cancel")}
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
            {busy ? t(locale, "works.uploading") : t(locale, "works.cropApply")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkMediaFields({
  locale,
  initialLogo = null,
  initialImages = [],
}: {
  locale: Locale;
  initialLogo?: MediaRef | null;
  initialImages?: MediaRef[];
}) {
  const [logo, setLogo] = useState<MediaRef | null>(initialLogo);
  const [crop, setCrop] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [images, setImages] = useState<ImageItem[]>(() =>
    initialImages.slice(0, WORK_IMAGE_MAX).map((m, i) => ({
      id: i + 1,
      key: m.key,
      url: m.url,
      status: "ok",
      file: null,
    })),
  );
  const nextId = useRef(initialImages.length + 1);
  const fileInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /* 本地 blob 预览 URL 台账,卸载时统一回收 */
  const blobs = useRef(new Set<string>());
  useEffect(() => {
    const set = blobs.current;
    return () => {
      for (const u of set) URL.revokeObjectURL(u);
    };
  }, []);

  /* ---- Logo ---- */
  const pickLogo = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const src = URL.createObjectURL(file);
    blobs.current.add(src);
    const img = new Image();
    img.onload = () => setCrop({ src, img });
    img.onerror = () => {
      blobs.current.delete(src);
      URL.revokeObjectURL(src);
    };
    img.src = src;
  };

  const closeCrop = () => {
    if (crop) {
      blobs.current.delete(crop.src);
      URL.revokeObjectURL(crop.src);
    }
    setCrop(null);
  };

  const applyCrop = async (blob: Blob) => {
    const ref = await uploadMedia(
      new File([blob], "logo.png", { type: "image/png" }),
      "logo",
    );
    setLogo(ref);
    closeCrop();
  };

  /* ---- 配图 ---- */
  const addFiles = (files: Iterable<File>) => {
    const room = WORK_IMAGE_MAX - images.length;
    if (room <= 0) return;
    const accepted = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (accepted.length === 0) return;
    const items: ImageItem[] = accepted.map((file) => {
      const url = URL.createObjectURL(file);
      blobs.current.add(url);
      return { id: nextId.current++, key: "", url, status: "uploading", file };
    });
    setImages((cur) => [...cur, ...items]);
    for (const item of items) void upload(item.id, item.file as File);
  };

  /* 单张上传:成功换 CDN URL 并回收 blob;失败留原件可重试 */
  const upload = async (id: number, file: File) => {
    try {
      const ref = await uploadMedia(file, "image");
      setImages((cur) =>
        cur.map((it) => {
          if (it.id !== id) return it;
          if (it.url.startsWith("blob:")) {
            blobs.current.delete(it.url);
            URL.revokeObjectURL(it.url);
          }
          return { ...it, key: ref.key, url: ref.url, status: "ok", file: null };
        }),
      );
    } catch {
      setImages((cur) =>
        cur.map((it) => (it.id === id ? { ...it, status: "error" } : it)),
      );
    }
  };

  const removeImage = (id: number) => {
    setImages((cur) =>
      cur.filter((it) => {
        if (it.id !== id) return true;
        if (it.url.startsWith("blob:")) {
          blobs.current.delete(it.url);
          URL.revokeObjectURL(it.url);
        }
        return false;
      }),
    );
  };

  /* 拖拽排序(HTML5 DnD):dragIndex 源 → overIndex 目标,drop 时移动 */
  const moveImage = (from: number, to: number) => {
    if (from === to) return;
    setImages((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /* 粘贴添加:剪贴板里有图片文件才接管(不动文本粘贴) */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const doneKeys = images.filter((it) => it.status === "ok" && it.key).map((it) => it.key);

  return (
    <div className="space-y-4">
      {/* 提交载体:只落上传完成的 key(上传中/失败的条目不随表单提交) */}
      <input type="hidden" name="logoKey" value={logo?.key ?? ""} readOnly />
      <input type="hidden" name="imageKeys" value={JSON.stringify(doneKeys)} readOnly />

      {/* ---- Logo:方形预览 + 客户端裁剪上传 ---- */}
      <div>
        <span className="mb-1.5 block text-[11.5px] text-grey">
          {t(locale, "works.logo")}
        </span>
        <div className="flex items-center gap-3">
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logo.url}
              alt=""
              className="size-16 rounded-lg border border-line object-cover"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-lg border border-dashed border-line text-grey/50">
              <ImagePlus size={18} aria-hidden="true" />
            </span>
          )}
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => logoInput.current?.click()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <ImagePlus size={12} aria-hidden="true" />
              {t(locale, logo ? "works.logoChange" : "works.logoUpload")}
            </button>
            {logo && (
              <button
                type="button"
                onClick={() => setLogo(null)}
                className="inline-flex min-h-9 items-center rounded-lg px-2 font-mono text-[11px] text-grey transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                {t(locale, "works.logoRemove")}
              </button>
            )}
          </span>
        </div>
        <input
          ref={logoInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickLogo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {/* ---- 配图:点击/拖入/粘贴添加,拖拽排序,第一张 = 封面 ---- */}
      <div>
        <span className="mb-1.5 flex items-baseline justify-between text-[11.5px] text-grey">
          <span>{t(locale, "works.images")}</span>
          <span className="font-mono text-[10.5px] text-grey/70">
            {images.length}/{WORK_IMAGE_MAX}
          </span>
        </span>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
            dropActive ? "border-blue bg-blue/5" : "border-line hover:border-paper/30"
          }`}
        >
          <ImagePlus size={18} className="text-grey" aria-hidden="true" />
          <span className="text-[11.5px] text-grey">
            {t(locale, "works.imagesAdd")}
          </span>
          <span className="text-[10.5px] leading-relaxed text-grey/70">
            {t(locale, "works.imagesHint")}
          </span>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {images.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {images.map((it, i) => (
              <div
                key={it.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                  setDragIndex(i);
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverIndex(i);
                }}
                onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) moveImage(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`group relative aspect-video overflow-hidden rounded-lg border bg-card ${
                  overIndex === i && dragIndex !== null && dragIndex !== i
                    ? "border-blue"
                    : "border-line"
                } ${dragIndex === i ? "opacity-40" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.url}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                {/* 封面徽标:第一张即封面(顺序即语义) */}
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-blue px-1 py-px font-mono text-[9.5px] font-semibold text-white">
                    {t(locale, "works.coverBadge")}
                  </span>
                )}
                <span className="pointer-events-none absolute bottom-1 left-1 text-grey/0 transition-colors group-hover:text-white/70">
                  <GripVertical size={12} aria-hidden="true" />
                </span>
                <button
                  type="button"
                  onClick={() => removeImage(it.id)}
                  aria-label={t(locale, "works.imageRemove")}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded bg-black/60 text-white/80 transition-colors hover:bg-black/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <X size={11} aria-hidden="true" />
                </button>
                {it.status === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/55 font-mono text-[10px] text-white/85">
                    <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                    {t(locale, "works.uploading")}
                  </span>
                )}
                {it.status === "error" && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/65">
                    <span className="font-mono text-[10px] text-red-300">
                      {t(locale, "works.uploadFailed")}
                    </span>
                    {it.file && (
                      <button
                        type="button"
                        onClick={() => {
                          setImages((cur) =>
                            cur.map((x) =>
                              x.id === it.id ? { ...x, status: "uploading" } : x,
                            ),
                          );
                          void upload(it.id, it.file as File);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10px] text-paper hover:border-blue"
                      >
                        <RefreshCw size={10} aria-hidden="true" />
                        {t(locale, "works.retry")}
                      </button>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {crop && (
        <LogoCropDialog
          img={crop.img}
          src={crop.src}
          locale={locale}
          onCancel={closeCrop}
          onApply={applyCrop}
        />
      )}
    </div>
  );
}
