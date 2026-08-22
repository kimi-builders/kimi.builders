"use client";

/* Avatar field (the settings profile form): current-avatar preview +
   change (crop overlay -> kind=avatar upload) + reset to default. A
   successful upload writes the returned CDN URL into avatar_url for
   the form submit; reset sets avatar_clear=1 and the server
   explicitly empties avatar_url (the next OAuth login re-syncs the
   provider avatar, per the overwrite guard in
   src/lib/auth/users.ts). */
import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import Avatar from "@/components/Avatar";
import ImageCropDialog from "@/components/ImageCropDialog";
import { t, type Locale } from "@/src/lib/i18n";
import { uploadMedia } from "@/src/lib/upload";

export default function AvatarField({
  locale,
  handle,
  currentUrl,
  hasCustom,
  inputCls,
  labelCls,
}: {
  locale: Locale;
  handle: string;
  /* The currently saved avatar URL (possibly "" = none). */
  currentUrl: string;
  /* Server-decided: whether the current avatar was uploaded on site
     (drives the "reset to default" button). */
  hasCustom: boolean;
  inputCls: string;
  labelCls: string;
}) {
  /* url: the avatar_url field value, empty = no change (existing form
     semantics); clear: the explicit reset flag. */
  const [url, setUrl] = useState("");
  const [clear, setClear] = useState(false);
  const [custom, setCustom] = useState(hasCustom);
  const [crop, setCrop] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /* Ledger of local blob preview URLs, reclaimed together on
     unmount. */
  const blobs = useRef(new Set<string>());
  useEffect(() => {
    const set = blobs.current;
    return () => {
      for (const u of set) URL.revokeObjectURL(u);
    };
  }, []);

  const preview = clear ? "" : url || currentUrl;

  const pick = (file: File | undefined) => {
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
      new File([blob], "avatar.png", { type: "image/png" }),
      "avatar",
    );
    setUrl(ref.url);
    setClear(false);
    setCustom(true);
    closeCrop();
  };

  return (
    <div>
      <span className={labelCls}>{t(locale, "set.avatar")}</span>
      <div className="flex items-center gap-3">
        <Avatar url={preview} handle={handle} size={56} className="shrink-0" />
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <ImagePlus size={12} aria-hidden="true" />
            {t(locale, "set.avatarChange")}
          </button>
          {custom && !clear && (
            <button
              type="button"
              onClick={() => {
                setClear(true);
                setUrl("");
              }}
              className="inline-flex min-h-9 items-center rounded-lg px-2 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {t(locale, "set.avatarReset")}
            </button>
          )}
        </span>
      </div>
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
      {clear ? (
        <p className="mt-2 text-xs leading-relaxed text-grey/80">
          {t(locale, "set.avatarResetNote")}{" "}
          <button
            type="button"
            onClick={() => setClear(false)}
            className="text-paper underline decoration-ui-blue/60 underline-offset-4 hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "set.avatarUndo")}
          </button>
        </p>
      ) : (
        <input
          name="avatar_url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={currentUrl || "https://…"}
          maxLength={500}
          aria-label={t(locale, "set.avatarUrl")}
          className={`${inputCls} mt-2 font-mono`}
        />
      )}
      {/* Reset to default: the url is already empty and the URL input unmounted, so only the clear flag submits (avatar_clear=1) */}
      <input type="hidden" name="avatar_clear" value={clear ? "1" : ""} readOnly />
      <span className="mt-1 block text-xs leading-relaxed text-grey/80">
        {t(locale, "set.avatarHint")}
      </span>

      {crop && (
        <ImageCropDialog
          img={crop.img}
          src={crop.src}
          title={t(locale, "set.avatarCropTitle")}
          hint={t(locale, "set.avatarCropHint")}
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
