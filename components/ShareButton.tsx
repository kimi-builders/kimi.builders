"use client";

/* 分享按钮:复制帖子链接(带标题)到剪贴板,成功后图标变勾 2 秒。
   必须客户端:要用 navigator.clipboard 和 window.location.origin。
   可选 posterHref:有值时旁边多一颗「海报」小按钮,新 tab 打开海报 PNG
   (?download=1 附件头直接下载);无值时行为完全不变。 */
import { useState } from "react";
import { Check, ImageDown, Share2 } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

export default function ShareButton({
  path,
  title,
  locale,
  posterHref,
}: {
  path: string;
  title: string;
  locale: Locale;
  posterHref?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-4">
      <button
        type="button"
        aria-label={t(locale, "post.shareAria")}
        onClick={async () => {
          const url = `${window.location.origin}${path}`;
          try {
            await navigator.clipboard.writeText(`${title} ${url}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* 剪贴板被拒(权限/非安全上下文)就静默,不打扰阅读 */
          }
        }}
        className={`inline-flex items-center gap-1.5 font-mono text-xs transition-colors ${
          copied ? "text-blue" : "text-grey hover:text-blue"
        }`}
      >
        {copied ? <Check size={14} /> : <Share2 size={14} />}
        <span>{t(locale, copied ? "post.copied" : "post.share")}</span>
      </button>
      {posterHref && (
        <button
          type="button"
          aria-label={t(locale, "post.posterAria")}
          onClick={() =>
            window.open(
              `${posterHref}${posterHref.includes("?") ? "&" : "?"}download=1`,
              "_blank",
              "noopener,noreferrer",
            )
          }
          className="inline-flex items-center gap-1.5 font-mono text-xs text-grey transition-colors hover:text-blue"
        >
          <ImageDown size={14} />
          <span>{t(locale, "post.poster")}</span>
        </button>
      )}
    </span>
  );
}
