"use client";

/* 列表与详情共用的媒体兜底:截图加载失败时回落到真实 Logo 或 Lucide 图标。
   不再绘制渐变/首字母假素材,两种主题都只走全局颜色令牌。 */
import { useState } from "react";
import { GalleryVerticalEnd } from "lucide-react";

export default function WorkScreenshot({
  url,
  name,
  logoUrl = "",
  kindLabel = "",
  embedded = false,
}: {
  url: string;
  name: string;
  logoUrl?: string;
  kindLabel?: string;
  embedded?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className={`flex aspect-video w-full flex-col items-center justify-center gap-3 bg-moon text-grey ${embedded ? "" : "rounded-2xl border border-line"}`}>
        {logoUrl && !logoFailed ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            onError={() => setLogoFailed(true)}
            className="size-14 rounded-xl border border-line object-cover"
          />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-card text-blue">
            <GalleryVerticalEnd size={24} aria-hidden="true" />
          </span>
        )}
        {kindLabel && <span className="font-mono text-[10px] tracking-[0.14em] text-grey">{kindLabel}</span>}
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={name}
      onError={() => setFailed(true)}
      className={`aspect-video w-full object-cover ${embedded ? "" : "rounded-2xl border border-line"}`}
    />
  );
}
