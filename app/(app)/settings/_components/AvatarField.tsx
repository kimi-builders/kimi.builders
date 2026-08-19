"use client";

/* 头像字段(设置页资料表单):当前头像预览 + 更换(裁剪弹层 → kind=avatar 上传)
   + 恢复默认。上传成功把返回的 CDN URL 写进 avatar_url 字段随表单提交;
   恢复默认置 avatar_clear=1,服务端显式清空 avatar_url(下次 OAuth 登录会
   重新同步 provider 头像,见 src/lib/auth/users.ts 的防覆盖约定)。 */
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
  /* 当前已保存的头像 URL(可能为 "" = 无头像) */
  currentUrl: string;
  /* 服务端判定:当前头像是否为站内自传(决定「恢复默认」按钮是否出现) */
  hasCustom: boolean;
  inputCls: string;
  labelCls: string;
}) {
  /* url:avatar_url 字段值,空 = 不修改(沿用现有表单语义);clear:显式清空标记 */
  const [url, setUrl] = useState("");
  const [clear, setClear] = useState(false);
  const [custom, setCustom] = useState(hasCustom);
  const [crop, setCrop] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /* 本地 blob 预览 URL 台账,卸载时统一回收 */
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
      <div className="mt-1.5 flex items-center gap-3">
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
      {/* 恢复默认时 url 已置空且 URL 输入框卸载,只提交清空标记(avatar_clear=1) */}
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
