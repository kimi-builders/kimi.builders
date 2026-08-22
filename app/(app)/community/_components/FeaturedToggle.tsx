"use client";

/* Editorial featuring controls (rendered for admin/mod only, decided
   server-side; the action re-checks). Unfeatured -> "feature" expands
   a small reason form; featured -> shows the current reason + an
   unfeature button. Success toasts + router.refresh()es; the home tag
   cache is invalidated immediately inside the action. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { featurePostAction, unfeaturePostAction } from "../actions";

export default function FeaturedToggle({
  postId,
  featured,
  locale,
}: {
  postId: number;
  featured: { reason: string; editorHandle: string | null } | null;
  locale: Locale;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("post_id", String(postId));
      fd.set("reason", reason);
      const res = await featurePostAction(fd);
      if (!res.ok) {
        toast(res.error ?? t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.featured"));
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const unset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("post_id", String(postId));
      const res = await unfeaturePostAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.unfeatured"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "inline-flex items-center font-mono text-xs text-grey transition-colors hover:text-ui-blue disabled:opacity-40";

  if (featured) {
    return (
      <span className="inline-flex min-w-0 items-center gap-3 font-mono text-xs">
        <span
          className="max-w-56 truncate text-ui-blue"
          title={featured.reason}
        >
          {t(locale, "featured.badge")} · {featured.reason}
        </span>
        <button
          type="button"
          onClick={unset}
          disabled={busy}
          className={btn}
        >
          {busy ? t(locale, "post.submitting") : t(locale, "featured.unset")}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={btn}
      >
        {t(locale, "featured.set")}
      </button>
      {open && (
        <span className="inline-flex items-center gap-2">
          <input
            type="text"
            value={reason}
            maxLength={280}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={t(locale, "featured.reasonPh")}
            autoFocus
            className="w-56 border border-line bg-transparent px-2 py-1 font-mono text-xs text-paper placeholder:text-grey focus:border-blue focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !reason.trim()}
            className={btn}
          >
            {busy ? t(locale, "post.submitting") : t(locale, "post.save")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
            className={btn}
          >
            {t(locale, "post.cancel")}
          </button>
        </span>
      )}
    </span>
  );
}
