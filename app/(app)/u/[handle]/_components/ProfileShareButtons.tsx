"use client";

/* The profile "share" button: copies the profile URL to the clipboard,
   checks for 1.6s on success. Separate from ShareButton — this wants
   the design's ghost button form, not the post-share styling. */
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
          /* A rejected clipboard (permissions/insecure context) stays
             silent. */
        }
      }}
      className={`inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 font-mono text-xs whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto sm:gap-1.5 sm:px-3 ${
        copied ? "text-ui-blue" : "text-grey hover:text-paper"
      }`}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Link2 size={13} aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
