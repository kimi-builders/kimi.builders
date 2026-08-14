"use client";

/* 列表与详情共用的媒体兜底。封面语义:配图第一张;无配图回落旧 screenshot_url
   外链;再空走「名称砖」——moon 抬升面 + Title Case 产品名(颜色全走全局令牌,
   随主题变化),有上传 Logo 则小尺寸居上。不绘制渐变/假素材。 */
import { useState } from "react";

/* Title Case:每个拉丁词首字母大写,其余字母维持原大小写
   (保留 KimiClaw 这类既定驼峰;kimi-mcp-server → Kimi-Mcp-Server) */
function titleCase(s: string): string {
  return s.replace(/[A-Za-z][A-Za-z0-9]*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

export default function WorkScreenshot({
  url,
  name,
  logoUrl = "",
  embedded = false,
  fill = false,
}: {
  url: string;
  name: string;
  logoUrl?: string;
  embedded?: boolean;
  /* 行式卡左列:移动端 aspect-video,sm+ 撑满列高(object-cover 裁切) */
  fill?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const mediaCls = fill ? "aspect-video sm:aspect-auto sm:h-full" : "aspect-video";
  if (!url || failed) {
    return (
      <div className={`flex w-full flex-col items-center justify-center gap-2.5 bg-moon px-4 text-center ${mediaCls} ${fill ? "sm:min-h-36" : ""} ${embedded ? "" : "rounded-2xl border border-line"}`}>
        {logoUrl && !logoFailed && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt=""
            onError={() => setLogoFailed(true)}
            className="size-10 shrink-0 rounded-[10px] border border-line object-cover"
          />
        )}
        <span className="line-clamp-2 break-words font-mono text-[15px] font-medium leading-snug text-paper">
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
      className={`${mediaCls} w-full object-cover ${embedded ? "" : "rounded-2xl border border-line"}`}
    />
  );
}
