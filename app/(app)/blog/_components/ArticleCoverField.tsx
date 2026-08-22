"use client";

/* 文章封面字段(20260822):与作品封面同一交互——「上传封面图 / 封面风格」
   二选一 tab。上传档:选图比例 ≈16/9(±0.02)直传免打扰,否则先进
   ImageCropDialog 固定 16:9 裁剪再传(uploadMedia → /api/upload,
   sharp 归一 webp → R2);外链 URL 仍可手填并存。风格档:CoverToneField
   色卡(与作品名称砖同一色板),常驻挂载 + inactive 保状态(切 tab 不丢)。
   两值独立上报父组件:payload 组装 cover(图 URL,优先渲染)+
   coverTone(无图/图挂时的章字砖色,theme = 跟随主题不落 payload)。 */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import ImageCropDialog from "@/components/ImageCropDialog";
import { INPUT_CLS, LABEL_CLS } from "@/components/form-classes";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { uploadMedia } from "@/src/lib/upload";
import CoverToneField from "../../works/_components/CoverToneField";

export default function ArticleCoverField({
  locale,
  url,
  tone,
  onUrlChange,
  onToneChange,
}: {
  locale: Locale;
  url: string;
  tone: string;
  onUrlChange: (url: string) => void;
  onToneChange: (tone: string) => void;
}) {
  const [mode, setMode] = useState<"image" | "tone">(url ? "image" : "tone");
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [crop, setCrop] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /* 只上报与父级当前值不同的色调(20260822 修复):CoverToneField 激活时会
     重报当前值,而 inline 回调身份不稳会让该 effect 每渲染跑一次;不比对
     就派发,每次 set 新对象都触发重渲染 → 自激成 Maximum update depth。
     与父级 tone 相同则不派发,环在第一步就断掉 */
  const handleTone = (v: string) => {
    if (v !== tone) onToneChange(v);
  };

  /* 裁剪源 blob 用完即收(卸载兜底,防泄漏) */
  useEffect(() => {
    return () => {
      if (crop) URL.revokeObjectURL(crop.src);
    };
  }, [crop]);

  const uploadCover = async (file: File) => {
    setUploading(true);
    try {
      const ref = await uploadMedia(file, "image");
      setFailed(false);
      onUrlChange(ref.url);
      /* 上传成功自动切到图(与作品同口径:两种来源以图优先) */
      setMode("image");
    } catch {
      /* 与作品口径一致:失败要出声,静默失败像「传上了但没显示」 */
      toast(t(locale, "works.uploadFailed"), "error");
    } finally {
      setUploading(false);
    }
  };

  /* 选图:列表封面恒定 16:9 展示——比例已对直传,否则进裁剪框定构图 */
  const pick = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (Math.abs(ratio - 16 / 9) <= 0.02) {
        URL.revokeObjectURL(src);
        void uploadCover(file);
      } else {
        setCrop({ src, img });
      }
    };
    img.onerror = () => URL.revokeObjectURL(src);
    img.src = src;
  };

  const closeCrop = () => {
    if (crop) URL.revokeObjectURL(crop.src);
    setCrop(null);
  };

  const applyCrop = async (blob: Blob) => {
    await uploadCover(new File([blob], "cover.png", { type: "image/png" }));
    closeCrop();
  };

  return (
    <div>
      <label className={LABEL_CLS}>
        {locale === "zh" ? "封面(可选)" : "Cover (optional)"}
      </label>
      {/* 来源二选一 tab(与作品封面同款 seg;切 tab 不清值,状态互不丢) */}
      <div className={SEG_WRAP} role="radiogroup" aria-label={t(locale, "works.coverModeTone")}>
        {(
          [
            { id: "image", key: "works.coverModeImage" },
            { id: "tone", key: "works.coverModeTone" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`${SEG_ITEM} ${mode === m.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE}`}
          >
            {t(locale, m.key)}
          </button>
        ))}
      </div>

      {mode === "image" ? (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <div className="w-full sm:max-w-md">
            <input
              value={url}
              onChange={(e) => {
                setFailed(false);
                onUrlChange(e.target.value);
              }}
              placeholder="https://… 或 /covers/x.png"
              maxLength={500}
              className={`${INPUT_CLS} font-mono text-xs`}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
              >
                {uploading ? (
                  <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus size={12} aria-hidden="true" />
                )}
                {uploading
                  ? t(locale, "works.uploading")
                  : t(locale, url ? "works.logoChange" : "works.coverUpload")}
              </button>
              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setFailed(false);
                    onUrlChange("");
                  }}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <X size={12} aria-hidden="true" />
                  {t(locale, "works.logoRemove")}
                </button>
              )}
            </div>
          </div>
          <div className="aspect-video w-40 shrink-0 overflow-hidden rounded-lg border border-line">
            {url && !failed ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={url}
                alt=""
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="work-cover-tile flex h-full w-full items-center justify-center font-mono text-[10px] text-grey">
                {url
                  ? (locale === "zh" ? "封面加载失败" : "cover failed to load")
                  : t(locale, "works.tilePreview")}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 常驻挂载 + inactive:色卡状态切回上传档也保留(与作品同方案) */
        <div className="mt-3">
          <CoverToneField
            locale={locale}
            initialTone={tone}
            inactive={mode !== "tone"}
            hideLabel
            onToneChange={handleTone}
          />
        </div>
      )}
      <p className="mt-1.5 text-xs text-grey/70">
        {t(locale, "works.coverToneHint")}
      </p>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {crop && (
        <ImageCropDialog
          img={crop.img}
          src={crop.src}
          aspect={16 / 9}
          title={t(locale, "works.coverCropTitle")}
          hint={t(locale, "works.coverCropHint")}
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
