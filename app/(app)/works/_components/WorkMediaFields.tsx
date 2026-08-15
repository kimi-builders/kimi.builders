"use client";

/* 作品媒体字段(20260826_work_media):Logo(客户端裁剪后上传)+ 配图(≤9,第一张 = 封面)。
   仅「我的作品」路径渲染(WorkForm 按 kind 条件挂载);awesome 推荐条目不出现,
   服务端也强制置空。提交走隐藏字段:logoKey 单 key,imageKeys 为 key 的 JSON 数组;
   上传中/失败的配图不进隐藏字段(不提交半截状态)。
   上传统一打 POST /api/upload(kind=logo|image),裁剪/拖拽/排序全手写,无三方库。 */
import { useEffect, useRef, useState } from "react";
import {
  GripVertical,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import ImageCropDialog from "@/components/ImageCropDialog";
import { t, type Locale } from "@/src/lib/i18n";
import { uploadMedia } from "@/src/lib/upload";
import { WORK_IMAGE_MAX } from "@/src/lib/work-media";
import CoverToneField from "./CoverToneField";

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

export default function WorkMediaFields({
  locale,
  initialLogo = null,
  initialImages = [],
  initialTone = "theme",
  initialFit = "cover",
}: {
  locale: Locale;
  initialLogo?: MediaRef | null;
  initialImages?: MediaRef[];
  /* 20260908:名称砖色调(theme=跟随主题)+ 封面适配(cover/contain)回填 */
  initialTone?: string;
  initialFit?: string;
}) {
  const [fit, setFit] = useState(initialFit === "contain" ? "contain" : "cover");
  /* 适配自动建议:第一张竖屏图上传成功时建议「补边」;用户手动选过就不再插手 */
  const fitTouched = useRef(initialFit === "contain");
  const fitSuggestedFor = useRef<string | null>(null);
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

  /* 适配自动建议:第一张(=封面)图明显高瘦(h > w×1.15)时建议「补边完整」;
     每张首图只建议一次,用户手动选过(fitTouched)就不再改 */
  const firstOkUrl = images.find((it) => it.status === "ok" && it.url)?.url ?? null;
  useEffect(() => {
    if (!firstOkUrl || fitTouched.current) return;
    if (fitSuggestedFor.current === firstOkUrl) return;
    fitSuggestedFor.current = firstOkUrl;
    const img = new Image();
    img.onload = () => {
      if (!fitTouched.current && img.naturalHeight > img.naturalWidth * 1.15) {
        setFit("contain");
      }
    };
    img.src = firstOkUrl;
  }, [firstOkUrl]);

  return (
    <div className="space-y-4">
      {/* 提交载体:只落上传完成的 key(上传中/失败的条目不随表单提交) */}
      <input type="hidden" name="logoKey" value={logo?.key ?? ""} readOnly />
      <input type="hidden" name="imageKeys" value={JSON.stringify(doneKeys)} readOnly />
      <input type="hidden" name="coverFit" value={fit} readOnly />

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
                className="inline-flex min-h-9 items-center rounded-lg px-2 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
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
                    <span className="font-mono text-[10px] text-blue">
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

      {/* ---- 封面适配(有配图时生效):裁切填满 / 补边完整 ---- */}
      {images.length > 0 && (
        <div>
          <span className="mb-1.5 block text-[11.5px] text-grey">
            {t(locale, "works.coverFit")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["cover", "contain"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={fit === id}
                onClick={() => {
                  fitTouched.current = true;
                  setFit(id);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                  fit === id
                    ? "border-blue bg-blue/10 text-blue"
                    : "border-line bg-bg text-grey hover:border-paper/30 hover:text-paper"
                }`}
              >
                {t(locale, id === "cover" ? "works.coverFitCover" : "works.coverFitContain")}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
            {t(locale, "works.coverFitHint")}
          </span>
        </div>
      )}

      {/* ---- 封面风格(无配图时的名称砖)---- */}
      {images.length === 0 ? (
        <CoverToneField locale={locale} initialTone={initialTone} />
      ) : (
        /* 有配图时不显示色板,但隐藏字段要把已选色调带回去——
           否则编辑一次就被重置成 theme(2026-08-14) */
        <input type="hidden" name="coverTone" value={initialTone} readOnly />
      )}

      {crop && (
        <ImageCropDialog
          img={crop.img}
          src={crop.src}
          title={t(locale, "works.logoCropTitle")}
          hint={t(locale, "works.logoCropHint")}
          zoomLabel={t(locale, "works.logoZoom")}
          cancelLabel={t(locale, "post.cancel")}
          applyLabel={t(locale, "works.cropApply")}
          busyLabel={t(locale, "works.uploading")}
          errorLabel={t(locale, "err.uploadFailed")}
          onCancel={closeCrop}
          onApply={applyCrop}
        />
      )}
    </div>
  );
}
