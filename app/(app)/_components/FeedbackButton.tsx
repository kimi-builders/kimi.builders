"use client";

/* Feedback entry (B2): a small flag control opening a native <dialog>
   (same modal grammar as GlobalSearch). Reasons are the fixed enum from
   src/lib/feedback.ts; an optional note rides along. States: idle →
   submitting → done | duplicate. Anonymous visitors get the login
   redirect instead — feedback is a member action. Vocabulary: feedback,
   never "reporting" (a small community flags what feels off; moderators
   clean or hide). */
import { useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Flag, X } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";

const REASONS = ["spam", "abuse", "offtopic", "privacy", "other"] as const;

export default function FeedbackButton({
  locale,
  targetType,
  targetId,
  compact = false,
  className = "",
  loggedIn,
  returnTo = "/",
}: {
  locale: Locale;
  targetType: "post" | "comment" | "work" | "work_comment";
  targetId: number;
  /* compact: the icon-only inline form (comment rows); full: a labeled
     row form (detail action bars). */
  compact?: boolean;
  className?: string;
  loggedIn: boolean;
  /* Signed-out visitors follow the login-and-return pattern; the return
     path must come from the server (no window at SSR). */
  returnTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string>("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "done" | "duplicate">(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const open = () => {
    setDone(null);
    setNote("");
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, note }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as {
        ok: boolean;
        code?: string;
      };
      setDone(data.ok ? "done" : "duplicate");
    } catch {
      setDone("done");
    } finally {
      setBusy(false);
    }
  };

  const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;

  const triggerCls = compact
    ? `flex size-7 items-center justify-center rounded-md text-grey/70 transition-colors hover:text-status-danger-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${className}`
    : `inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs text-grey transition-colors hover:bg-card hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${className}`;

  const trigger = (
    <button
      type="button"
      onClick={open}
      data-tip={t(locale, "feedback.flag")}
      aria-label={t(locale, "feedback.flag")}
      aria-haspopup="dialog"
      className={triggerCls}
    >
      <Flag size={compact ? 12 : 13} aria-hidden="true" />
      {!compact && <span>{t(locale, "feedback.flag")}</span>}
    </button>
  );

  return (
    <>
      {loggedIn ? (
        trigger
      ) : (
        <a
          href={loginHref}
          data-tip={t(locale, "feedback.flag")}
          aria-label={t(locale, "feedback.flag")}
          className={triggerCls}
        >
          <Flag size={compact ? 12 : 13} aria-hidden="true" />
          {!compact && <span>{t(locale, "feedback.flag")}</span>}
        </a>
      )}
      {mounted &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-labelledby="feedback-dialog-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
            className="fixed left-1/2 top-[16vh] m-0 w-[min(92vw,28rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
          >
            {done ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <Flag size={22} className="text-ui-blue" aria-hidden="true" />
                <p className="mt-3 text-sm text-paper">
                  {done === "duplicate"
                    ? t(locale, "feedback.dup")
                    : t(locale, "feedback.done")}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 rounded-lg bg-blue px-5 py-2 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {t(locale, "modal.close")}
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <h2
                    id="feedback-dialog-title"
                    className="font-mono text-sm font-semibold text-paper"
                  >
                    {t(locale, "feedback.title")}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    data-tip={t(locale, "modal.close")}
                    data-tip-side="bottom"
                    data-tip-align="right"
                    aria-label={t(locale, "modal.close")}
                    className="flex size-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="space-y-4 px-4 py-4">
                  <fieldset className="space-y-1.5">
                    <legend className="pb-1 font-mono text-xs text-grey">
                      {t(locale, "feedback.reasonLabel")}
                    </legend>
                    {REASONS.map((r) => (
                      <label
                        key={r}
                        className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-moon"
                      >
                        <input
                          type="radio"
                          name={`feedback-reason-${targetType}-${targetId}`}
                          value={r}
                          checked={reason === r}
                          onChange={() => setReason(r)}
                          className="accent-[var(--color-ui-blue)]"
                        />
                        {t(locale, `feedback.reason.${r}`)}
                      </label>
                    ))}
                  </fieldset>
                  <div>
                    <label
                      htmlFor={`report-note-${targetType}-${targetId}`}
                      className="block pb-1 font-mono text-xs text-grey"
                    >
                      {t(locale, "feedback.noteLabel")}
                    </label>
                    <textarea
                      id={`feedback-note-${targetType}-${targetId}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, 500))}
                      rows={3}
                      placeholder={t(locale, "feedback.notePh")}
                      className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm text-paper outline-none placeholder:text-grey/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-grey transition-colors hover:text-paper"
                  >
                    {t(locale, "feedback.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg bg-blue px-5 py-2 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? t(locale, "feedback.submitting") : t(locale, "feedback.submit")}
                  </button>
                </div>
              </>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}
