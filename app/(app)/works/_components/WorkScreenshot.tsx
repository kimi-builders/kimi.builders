"use client";

/* 列表与详情共用的媒体兜底。封面语义:配图第一张;无配图回落旧 screenshot_url
   外链;再空走「名称砖」——统一风格的生成封面(Laracasts 式色卡):
   分类图标 + 标签居左上,产品名 Title Case 居中,有上传 Logo 则居名上;
   底色 theme=跟随主题的 moon 抬升面,固定色=作者自选(作品)或类型族指派
   (Awesome),固定色砖叠一层极淡的织纹与顶部高光。不绘制渐变假素材。
   fit(20260908):cover=裁切填满(默认),contain=补边完整(竖屏图不拦腰裁)。 */
import { useState } from "react";
import WorkKindIcon from "@/components/WorkKindIcon";
import { coverToneHex } from "@/src/lib/cover-tones";

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
  fill = false,
}: {
  url: string;
  name: string;
  logoUrl?: string;
  kindLabel?: string;
  kindId?: string;
  tone?: string;
  fit?: string;
  embedded?: boolean;
  /* 行式卡左列:移动端 aspect-video,sm+ 撑满列高(object-cover 裁切) */
  fill?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const mediaCls = fill ? "aspect-video sm:aspect-auto sm:h-full" : "aspect-video";
  if (!url || failed) {
    /* 名称砖:固定色 = 暗色档(纸字不随主题变);theme = moon 抬升面,跟随主题 */
    const hex = coverToneHex(tone);
    return (
      <div
        style={hex ? { background: hex } : undefined}
        className={`relative flex w-full items-center justify-center ${
          hex ? "" : "bg-moon"
        } ${mediaCls} ${fill ? "sm:min-h-36" : ""} ${embedded ? "" : "rounded-2xl border border-line"}`}
      >
        {hex && (
          /* 织纹 + 顶部高光: Laracasts 色卡的颗粒感,压在纸字之下不抢戏 */
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 90% at 50% 0%, rgb(255 255 255 / 0.07), transparent 55%), repeating-conic-gradient(rgb(255 255 255 / 0.028) 0% 25%, transparent 0% 50%)",
              backgroundSize: "100% 100%, 18px 18px",
            }}
          />
        )}
        {kindLabel && (
          <span
            className={`absolute left-3.5 top-3 flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.16em] ${
              hex ? "text-white/55" : "text-grey"
            }`}
          >
            {kindId && <WorkKindIcon id={kindId} size={11} />}
            {kindLabel}
          </span>
        )}
        <span className="flex flex-col items-center gap-2 px-4 pt-4 text-center">
          {logoUrl && !logoFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              onError={() => setLogoFailed(true)}
              className={`size-9 shrink-0 rounded-lg border object-cover ${
                hex ? "border-white/15" : "border-line"
              }`}
            />
          )}
          <span
            className={`line-clamp-2 break-words font-mono text-[15px] font-medium leading-snug ${
              hex ? "text-[#efe8dc]" : "text-paper"
            }`}
          >
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
      className={`${mediaCls} w-full ${
        fit === "contain" ? "bg-moon object-contain" : "object-cover"
      } ${embedded ? "" : "rounded-2xl border border-line"}`}
    />
  );
}
