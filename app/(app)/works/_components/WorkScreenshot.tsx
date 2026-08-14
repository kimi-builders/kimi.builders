"use client";

/* 列表与详情共用的媒体兜底。封面语义:配图第一张;无配图回落旧 screenshot_url
   外链;再空走「名称砖」——统一风格的生成封面:theme=跟随主题的 moon 抬升面,
   固定色=作者在表单选定的色档(不随主题切换,全部暗底纸字可读);
   有上传 Logo 则小尺寸居上,kindLabel 作 mono eyebrow。
   fit(20260908):cover=裁切填满(默认),contain=补边完整(竖屏图不拦腰裁)。 */
import { useState } from "react";
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
  tone = "theme",
  fit = "cover",
  embedded = false,
  fill = false,
}: {
  url: string;
  name: string;
  logoUrl?: string;
  kindLabel?: string;
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
    /* 名称砖:固定色 = 作者选定的暗色档(纸色文字不随主题变);
       theme = moon 抬升面,文字跟随主题令牌 */
    const hex = coverToneHex(tone);
    return (
      <div
        style={hex ? { background: hex } : undefined}
        className={`flex w-full flex-col items-start justify-center gap-1.5 px-4 text-left ${
          hex ? "" : "bg-moon"
        } ${mediaCls} ${fill ? "sm:min-h-36" : ""} ${embedded ? "" : "rounded-2xl border border-line"}`}
      >
        {logoUrl && !logoFailed && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            onError={() => setLogoFailed(true)}
            className={`mb-0.5 size-9 shrink-0 rounded-lg border object-cover ${
              hex ? "border-white/15" : "border-line"
            }`}
          />
        )}
        {kindLabel && (
          <span
            className={`font-mono text-[9.5px] uppercase tracking-[0.18em] ${
              hex ? "text-white/45" : "text-grey"
            }`}
          >
            {kindLabel}
          </span>
        )}
        <span
          className={`line-clamp-2 break-words font-mono text-[15px] font-medium leading-snug ${
            hex ? "text-[#efe8dc]" : "text-paper"
          }`}
        >
          {titleCase(name)}
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
