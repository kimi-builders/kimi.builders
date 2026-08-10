"use client";

/* feed 卡「分享」:复制帖子链接到剪贴板,成功后变勾 1.6s。
   与 ShareButton 分开——feed 动作行要的是 pill 小按钮形态。 */
import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export default function FeedShareButton({
  id,
  label,
  copiedLabel,
}: {
  id: number;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/community/${id}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* 剪贴板被拒(权限/非安全上下文)就静默 */
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
        copied ? "text-blue" : "text-grey hover:bg-paper/[0.05] hover:text-paper"
      }`}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Share2 size={13} aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
