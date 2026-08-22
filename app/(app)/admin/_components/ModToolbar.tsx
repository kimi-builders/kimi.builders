"use client";

/* Moderation toolbar (rendered for admin/mod; shared by detail pages
   and the /admin lists): hide (with a reason) / unhide; soft delete
   (posts/comments only); hard delete (admin only, double-confirmed,
   copy states the irreversibility). Chain: pending -> toast ->
   router.refresh(); a successful hard delete on a detail page jumps to
   redirectAfter (the target no longer exists). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import {
  adminDeleteAction,
  hardDeleteAction,
  hideContentAction,
  unhideContentAction,
} from "../actions";

export default function ModToolbar({
  targetType,
  targetId,
  hidden,
  isAdmin,
  showSoftDelete = true,
  locale,
  redirectAfter,
}: {
  targetType: "post" | "comment" | "work";
  targetId: number;
  hidden: boolean;
  isAdmin: boolean;
  /* Detail pages already offer the author's own soft delete; the
     toolbar hides the duplicate entry. */
  showSoftDelete?: boolean;
  locale: Locale;
  /* Post-hard-delete redirect (passed by detail pages; lists refresh
     in place by default). */
  redirectAfter?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async (
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    okToast: string,
    after?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await action(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"), "error");
        return;
      }
      toast(okToast);
      if (after) after();
      else router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const base = () => {
    const fd = new FormData();
    fd.set("target_type", targetType);
    fd.set("target_id", String(targetId));
    return fd;
  };

  const hide = () => {
    const reason = window.prompt(t(locale, "mod.hidePrompt"), "");
    if (reason === null) return;
    const fd = base();
    fd.set("reason", reason);
    void run(hideContentAction, fd, t(locale, "mod.toastHidden"));
  };

  const unhide = () =>
    void run(unhideContentAction, base(), t(locale, "mod.toastUnhidden"));

  const softDelete = () => {
    if (!window.confirm(t(locale, "mod.softConfirm"))) return;
    void run(adminDeleteAction, base(), t(locale, "toast.deleted"));
  };

  const hardDelete = () => {
    /* Second confirmation; both state the irreversibility. */
    if (!window.confirm(t(locale, "mod.hardConfirm1"))) return;
    if (!window.confirm(t(locale, "mod.hardConfirm2"))) return;
    void run(hardDeleteAction, base(), t(locale, "toast.deleted"), () => {
      if (redirectAfter) router.push(redirectAfter);
      else router.refresh();
    });
  };

  const btn =
    "inline-flex items-center font-mono text-xs text-grey transition-colors hover:text-ui-blue disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-4">
      {hidden ? (
        <button type="button" onClick={unhide} disabled={busy} className={btn}>
          {t(locale, "mod.unhide")}
        </button>
      ) : (
        <button type="button" onClick={hide} disabled={busy} className={btn}>
          {t(locale, "mod.hide")}
        </button>
      )}
      {/* 软删:仅帖子/评论(作品无软删态,处置 = 屏蔽或硬删) */}
      {showSoftDelete && targetType !== "work" && (
        <button
          type="button"
          onClick={softDelete}
          disabled={busy}
          className={`${btn} hover:text-paper`}
        >
          {t(locale, "mod.softDelete")}
        </button>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={hardDelete}
          disabled={busy}
          className={`${btn} text-status-danger-fg hover:text-status-danger-fg`}
        >
          {t(locale, "mod.hardDelete")}
        </button>
      )}
    </span>
  );
}
