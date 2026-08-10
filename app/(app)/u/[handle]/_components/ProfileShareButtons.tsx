"use client";

/* 个人主页「分享主页」按钮:复制主页 URL 到剪贴板,成功后变勾 1.6s。
   与 ShareButton 分开——这里要的是设计稿的 ghost 按钮形态,不带动帖子那套样式。 */
import { useState } from "react";
import { Check, Link2 } from "lucide-react";

export default function ProfileShareButtons({
  path,
  label,
  copiedLabel,
}: {
  path: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* 剪贴板被拒(权限/非安全上下文)就静默 */
        }
      }}
      className={`inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto ${
        copied ? "text-blue" : "text-grey hover:text-paper"
      }`}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Link2 size={13} aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
