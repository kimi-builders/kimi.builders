"use client";

/* Feed-card "share": copies the post link to the clipboard, checks for
   1.6s on success. Separate from ShareButton — the feed action row
   wants a small pill button. */
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
          /* A rejected clipboard (permissions/insecure context) stays
             silent. */
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
        copied ? "text-ui-blue" : "text-grey hover:bg-paper/[0.05] hover:text-paper"
      }`}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Share2 size={13} aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
