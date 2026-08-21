"use client";

/* 列表与详情共用的媒体兜底。封面语义:配图第一张;无配图回落旧 screenshot_url
   外链;再空走「名称砖」——统一风格的生成封面:
   分类图标 + 标签居左上,产品名 Title Case 居中,有上传 Logo 则居名上;
   底色 theme=跟随主题的 .work-cover-tile,固定色=.work-tone-*(globals.css,
   双主题响应式,20260918)。不绘制渐变假素材。
   variant:row=行式卡左列(移动端 aspect-video,sm+ 撑满列高裁切);
   grid=网格卡(恒定 aspect-video);standalone=详情页直出。
   fit(20260908):cover=裁切填满(默认),contain=补边完整(竖屏图不拦腰裁)。
   hover 缩放挂 group-hover:卡片(行式/网格)带 group 时封面轻放大,
   无 group 祖先(详情页)不生效。 */
import { useState } from "react";
import WorkKindIcon from "@/components/WorkKindIcon";
import { coverTextureClass, coverToneClass } from "@/src/lib/cover-tones";

/* Title Case:每个拉丁词首字母大写,其余字母维持原大小写
   (保留 KimiClaw 这类既定驼峰;kimi-mcp-server → Kimi-Mcp-Server) */
function titleCase(s: string): string {
  return s.replace(/[A-Za-z][A-Za-z0-9]*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

export default function WorkScreenshot({
  url,
  name,
  logoUrl = "",
  kindLabel = "",
  kindId = "",
  tone = "theme",
  fit = "cover",
  embedded = false,
  variant = "standalone",
}: {
  url: string;
  name: string;
  logoUrl?: string;
  kindLabel?: string;
  kindId?: string;
  tone?: string;
  fit?: string;
  embedded?: boolean;
  /* row=行式卡左列(sm+ 撑满列高);grid=网格卡;standalone=详情页 */
  variant?: "row" | "grid" | "standalone";
}) {
  const [failed, setFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const mediaCls =
    variant === "row"
      ? "aspect-video sm:aspect-auto sm:h-full sm:min-h-36"
      : "aspect-video";
  const hoverCls = "transition-transform duration-base group-hover:scale-[1.03]";
  if (!url || failed) {
    /* 名称砖:固定色 = .work-tone-*(CSS 双主题,冷白/色档深字);
       theme = .work-cover-tile(深空/站点白,跟随主题);
       纹理变体按产品名哈希(coverTextureClass),约一半砖带细网格 */
    const toneCls = coverToneClass(tone);
    const textureCls = coverTextureClass(name);
    return (
      <div
        className={`relative flex w-full items-center justify-center ${
          toneCls ?? "work-cover-tile"
        } ${textureCls ?? ""} ${mediaCls} ${hoverCls} ${embedded ? "" : "rounded-2xl border border-line"}`}
      >
        {kindLabel && (
          <span
            className={`absolute left-3.5 top-3 z-[1] flex items-center gap-1 font-mono text-xs uppercase tracking-[0.08em] ${
              toneCls ? "work-tone__eyebrow" : "work-cover-tile__eyebrow"
            }`}
          >
            {kindId && <WorkKindIcon id={kindId} size={11} />}
            {kindLabel}
          </span>
        )}
        <span className="relative z-[1] flex flex-col items-center gap-2 px-4 pt-4 text-center">
          {logoUrl && !logoFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              onError={() => setLogoFailed(true)}
              className={`size-9 shrink-0 rounded-lg border object-cover ${
                toneCls ? "work-tone__logo" : "border-line"
              }`}
            />
          )}
          <span className="line-clamp-2 break-words font-mono text-sm font-medium leading-snug">
            {titleCase(name)}
          </span>
        </span>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={name}
      onError={() => setFailed(true)}
      className={`${mediaCls} w-full ${hoverCls} ${
        fit === "contain" ? "bg-moon object-contain" : "object-cover"
      } ${embedded ? "" : "rounded-2xl border border-line"}`}
    />
  );
}
