"use client";

/* Work media fields: logo (client-cropped then uploaded) + gallery
   images (<=9, first = cover). Active only on the "my work" path
   (WorkForm passes inactive); hidden for awesome entries, which the
   server also forces empty. Submission goes through hidden fields:
   logoKey is a single key, imageKeys a JSON array; in-flight or failed
   images never enter the hidden fields (no half-submitted state).
   inactive: permanently mounted, CSS-hidden — switching my-work /
   recommend intent never unmounts the component, so uploaded
   logo/cover/gallery state survives; the hidden fields stop submitting
   with it (the server forces awesome entries empty anyway — belt and
   suspenders). Uploads all go to POST /api/upload (kind=logo|image);
   cropping/drag-sort are hand-written, no third-party library. */
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
import { toast } from "@/src/lib/toast";
import { uploadMedia } from "@/src/lib/upload";
import { WORK_IMAGE_MAX } from "@/src/lib/work-media";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import CoverToneField from "./CoverToneField";

export interface MediaRef {
  key: string;
  url: string;
}

/* Media preview snapshot: the minimal set the form's live card preview
   needs. */
export interface MediaPreviewState {
  coverUrl: string | null;
  logoUrl: string | null;
  fit: string;
}

/* Gallery entry: empty key = upload unfinished; file stays for retry
   on failure. */
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
  initialCover = null,
  initialTone = "theme",
  initialFit = "cover",
  inactive = false,
  onPreviewChange,
  onToneChange,
}: {
  locale: Locale;
  initialLogo?: MediaRef | null;
  initialImages?: MediaRef[];
  /* Standalone list cover (image/ key; empty = name-brick color card). */
  initialCover?: MediaRef | null;
  /* Name-brick tone (theme = follow the theme) + cover fit
     (cover/contain) backfill. */
  initialTone?: string;
  initialFit?: string;
  /* true = recommend-external intent: UI hidden but mounted (state
     survives), nothing submitted. */
  inactive?: boolean;
  /* Cover/logo/fit changes reported up (live preview); the callback is
     a stable setter, no loop. */
  onPreviewChange?: (state: MediaPreviewState) => void;
  /* Tone selection reported up (passed through to the internal
     CoverToneField). */
  onToneChange?: (tone: string) => void;
}) {
  const [cover, setCover] = useState<MediaRef | null>(initialCover);
  const [coverUploading, setCoverUploading] = useState(false);
  /* Cover source tabs: upload an image / pick a style (name-brick
     palette). The initial tab follows the backfill (with a cover =
     image, without = palette); a successful upload switches to image,
     removing it switches back — the two sources are mutually exclusive,
     never stacked side by side. */
  const [coverMode, setCoverMode] = useState<"image" | "tone">(
    initialCover ? "image" : "tone",
  );
  /* The last tone selection: in image mode the palette isn't mounted,
     and the hidden field carries this instead — editing a covered work
     never resets the chosen tone. */
  const [toneState, setToneState] = useState(initialTone ?? "theme");
  const handleTone = (v: string) => {
    setToneState(v);
    onToneChange?.(v);
  };
  /* Cover 16:9 cropping: off-ratio images pass through the crop box
     first. */
  const [coverCrop, setCoverCrop] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [fit, setFit] = useState(initialFit === "contain" ? "contain" : "cover");
  /* Fit auto-suggestion: the first portrait image suggests "pad-to-fit";
     once the user picks manually, never interfere again. */
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
  const coverInput = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /* Ledger of local blob preview URLs, reclaimed together on unmount. */
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

  /* ---- Cover upload (16:9 crop) ---- */
  const uploadCover = async (file: File) => {
    setCoverUploading(true);
    try {
      await uploadMedia(file, "image").then((ref) => {
        setCover(ref);
        setCoverMode("image");
      });
    } catch {
      /* Upload failures must speak up: a silent one reads as "uploaded
         but not showing". */
      toast(t(locale, "works.uploadFailed"), "error");
    } finally {
      setCoverUploading(false);
    }
  };

  /* Cover picking: list covers always render at 16:9 — near-ratio
     images upload directly (no nagging), others enter the crop box
     first so portrait shots aren't cut at the waist. */
  const pickCover = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const src = URL.createObjectURL(file);
    blobs.current.add(src);
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (Math.abs(ratio - 16 / 9) <= 0.02) {
        blobs.current.delete(src);
        URL.revokeObjectURL(src);
        void uploadCover(file);
      } else {
        setCoverCrop({ src, img });
      }
    };
    img.onerror = () => {
      blobs.current.delete(src);
      URL.revokeObjectURL(src);
    };
    img.src = src;
  };

  const closeCoverCrop = () => {
    if (coverCrop) {
      blobs.current.delete(coverCrop.src);
      URL.revokeObjectURL(coverCrop.src);
    }
    setCoverCrop(null);
  };

  const applyCoverCrop = async (blob: Blob) => {
    await uploadCover(new File([blob], "cover.png", { type: "image/png" }));
    closeCoverCrop();
  };

  /* ---- Gallery ---- */
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

  /* Single upload: success swaps in the CDN URL and reclaims the blob;
     failure keeps the file for retry. */
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

  /* Drag sorting (HTML5 DnD): dragIndex source -> overIndex target,
     moved on drop. */
  const moveImage = (from: number, to: number) => {
    if (from === to) return;
    setImages((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  /* Paste-to-add: take over only when the clipboard holds image files
     (text paste untouched). */
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

  /* Fit auto-suggestion: when the first (= cover) image is clearly
     tall (h > w*1.15) suggest "pad-to-fit"; once per first image, and
     never after the user touches fit (fitTouched). */
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

  /* Preview reporting: any cover/logo/fit change syncs the form's live
     preview; onPreviewChange is the parent's setState (stable
     reference), including it in deps loops nothing. */
  useEffect(() => {
    onPreviewChange?.({
      coverUrl: cover?.url ?? null,
      logoUrl: logo?.url ?? null,
      fit,
    });
  }, [cover, logo, fit, onPreviewChange]);

  return (
    <div className={inactive ? "hidden" : "space-y-4"}>
      {/* 提交载体:只落上传完成的 key(上传中/失败的条目不随表单提交);
          inactive 时不渲染(服务端对 awesome 条目强制置空,双保险) */}
      {!inactive && (
        <>
          <input type="hidden" name="logoKey" value={logo?.key ?? ""} readOnly />
          <input type="hidden" name="imageKeys" value={JSON.stringify(doneKeys)} readOnly />
          <input type="hidden" name="coverKey" value={cover?.key ?? ""} readOnly />
          <input type="hidden" name="coverFit" value={fit} readOnly />
        </>
      )}

      {/* ---- Logo:方形预览 + 客户端裁剪上传 ---- */}
      <div>
        <span className="mb-1.5 block text-xs text-grey">
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
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              <ImagePlus size={12} aria-hidden="true" />
              {t(locale, logo ? "works.logoChange" : "works.logoUpload")}
            </button>
            {logo && (
              <button
                type="button"
                onClick={() => setLogo(null)}
                className="inline-flex min-h-9 items-center rounded-lg px-2 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
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

      {/* ---- 封面(二选一 tab,20260815):上传封面图 / 封面风格(名称砖色卡)。
          两种来源互斥——tab 切换代替「上传 + 条件色板」并排;色卡常驻挂载,
          已选色调在两档间切换不丢,隐藏字段始终提交(有封面时服务端以封面优先) ---- */}
      <div>
        <span className="mb-1.5 block text-xs text-grey">
          {t(locale, "works.cover")}
        </span>
        <div
          className={`${SEG_WRAP} max-sm:w-full`}
          role="group"
          aria-label={t(locale, "works.cover")}
        >
          {(
            [
              { id: "image", key: "works.coverModeImage" },
              { id: "tone", key: "works.coverModeTone" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setCoverMode(m.id)}
              aria-pressed={coverMode === m.id}
              className={`${SEG_ITEM} max-sm:flex-1 max-sm:justify-center ${
                coverMode === m.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
              }`}
            >
              {t(locale, m.key)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {coverMode === "image" ? (
            <div className="flex items-center gap-3">
              {cover ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={cover.url}
                  alt=""
                  className="h-24 w-40 rounded-lg border border-line object-cover"
                />
              ) : (
                <span className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-line text-grey/50">
                  <ImagePlus size={18} aria-hidden="true" />
                </span>
              )}
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => coverInput.current?.click()}
                  disabled={coverUploading}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
                >
                  {coverUploading ? (
                    <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus size={12} aria-hidden="true" />
                  )}
                  {coverUploading
                    ? t(locale, "works.uploading")
                    : t(locale, cover ? "works.logoChange" : "works.coverUpload")}
                </button>
                {cover && (
                  <button
                    type="button"
                    onClick={() => {
                      setCover(null);
                      /* Removing the cover naturally returns to the
                         palette source. */
                      setCoverMode("tone");
                    }}
                    className="inline-flex min-h-9 items-center rounded-lg px-2 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                  >
                    {t(locale, "works.logoRemove")}
                  </button>
                )}
              </span>
            </div>
          ) : (
            <CoverToneField
              locale={locale}
              /* Backfill uses the "last selection" rather than the raw
                 value: the component mounts/unmounts with the tab, and a
                 raw initialTone would silently drop the chosen tone on
                 tab return. */
              initialTone={toneState}
              inactive={inactive}
              hideLabel
              onToneChange={handleTone}
            />
          )}
          {coverMode === "image" && (
            <span className="mt-1 block text-xs leading-relaxed text-grey/80">
              {t(locale, "works.coverHint")}
            </span>
          )}
        </div>
        <input
          ref={coverInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickCover(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {/* ---- 配图:点击/拖入/粘贴添加,拖拽排序,展示在详情页图集 ---- */}
      <div>
        <span className="mb-1.5 flex items-baseline justify-between text-xs text-grey">
          <span>{t(locale, "works.images")}</span>
          <span className="font-mono text-xs text-grey/70">
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
          <span className="text-xs text-grey">
            {t(locale, "works.imagesAdd")}
          </span>
          <span className="text-xs leading-relaxed text-grey/70">
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
                  <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/55 font-mono text-xs text-white/85">
                    <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                    {t(locale, "works.uploading")}
                  </span>
                )}
                {it.status === "error" && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/65">
                    <span className="font-mono text-xs text-ui-blue">
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
                        className="inline-flex items-center gap-1 rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-xs text-paper hover:border-ui-blue"
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

      {/* ---- 封面适配(有上传封面或配图时生效):裁切填满 / 补边完整 ---- */}
      {(cover || images.length > 0) && (
        <div>
          <span className="mb-1.5 block text-xs text-grey">
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
          <span className="mt-1 block text-xs leading-relaxed text-grey/80">
            {t(locale, "works.coverFitHint")}
          </span>
        </div>
      )}

      {/* 封面风格档在 image 模式下不挂载,隐藏字段带回最近一次选择;
          tone 模式由 CoverToneField 自带隐藏字段提交(20260815 tab 化) */}
      {coverMode === "image" && !inactive && (
        <input type="hidden" name="coverTone" value={toneState} readOnly />
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

      {/* 封面裁剪(16:9):与 logo 同一交互,裁剪框固定 16:9 */}
      {coverCrop && (
        <ImageCropDialog
          img={coverCrop.img}
          src={coverCrop.src}
          aspect={16 / 9}
          title={t(locale, "works.coverCropTitle")}
          hint={t(locale, "works.coverCropHint")}
          zoomLabel={t(locale, "works.logoZoom")}
          cancelLabel={t(locale, "post.cancel")}
          applyLabel={t(locale, "works.cropApply")}
          busyLabel={t(locale, "works.uploading")}
          errorLabel={t(locale, "err.uploadFailed")}
          onCancel={closeCoverCrop}
          onApply={applyCoverCrop}
        />
      )}
    </div>
  );
}
