"use client";

/* Article cover field: the same interaction as the work cover —
   "upload an image / pick a style" tabs. Upload tab: an image already
   ~16/9 (±0.02) uploads directly without nagging; otherwise
   ImageCropDialog fixes a 16:9 crop first, then uploadMedia ->
   /api/upload (sharp normalizes to webp -> R2); an external URL can
   still be typed and coexist. Style tab: the CoverToneField palette
   (the same palette as work name bricks), permanently mounted with
   inactive state-keeping (tab switches lose nothing). Both values
   report to the parent independently: the payload assembles cover (the
   image URL, rendered first) + coverTone (the chapter-brick color when
   there's no image or it failed to load; theme = follow the theme,
   never in the payload). */
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

  /* Report only tones differing from the parent's current value:
     CoverToneField re-reports on activation, and an inline callback's
     unstable identity runs the effect every render; dispatching without
     comparing re-renders on every new object -> self-excites into
     Maximum update depth. Equal tone means no dispatch — the loop
     breaks at step one. */
  const handleTone = (v: string) => {
    if (v !== tone) onToneChange(v);
  };

  /* The crop-source blob is reclaimed when done (unmount backstop,
     against leaks). */
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
      /* A successful upload auto-switches to the image (same rule as
         works: the image wins between the two sources). */
      setMode("image");
    } catch {
      /* Same rule as works: failures must speak up — a silent one
         reads as "uploaded but not showing". */
      toast(t(locale, "works.uploadFailed"), "error");
    } finally {
      setUploading(false);
    }
  };

  /* Picking: list covers always render at 16:9 — on-ratio images
     upload directly, others enter the crop box to frame first. */
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
      {/* Two-source tab (same seg as the work cover); switching tabs keeps both values, no state is lost */}
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
        /* Permanent mount + inactive: palette state survives the
           switch back to upload (same scheme as works). */
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
