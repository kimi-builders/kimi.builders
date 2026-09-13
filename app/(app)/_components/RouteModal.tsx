"use client";

/* Route modal shell (for intercepted routes): showModal on mount;
   closing (X / backdrop / ESC) uniformly router.back()s to the source
   page; if the background page was already redirected away by an
   action (URL departed the mount point), close silently without going
   back. The shell uses overflow-clip to forbid focus scrolling — only
   the body container scrolls, so a hidden control in a long form
   can't push the whole dialog out of the viewport. dirtyGuard: passing
   it enables the "you have input" guard — once the form has input, X /
   backdrop / ESC no longer close directly; a bottom confirm bar offers
   keep editing / discard and close; a submit in flight (onSubmit) is
   never intercepted and navigates normally. The confirm bar is a real
   flex row of the dialog (never an overlay on the body), so the form
   footer's primary button can't share pixels with it while the bar is
   up — an overlaid sliver of the primary submit reads as a second
   primary and invites mis-publishing. */
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

/* The dirty flag lives here (this component owns the close flow). A
   form that drops its unsaved state in place — the post form's
   "clear draft" — must tell the modal, or the confirm bar would keep
   claiming a draft will survive a close that actually discards
   nothing. The event bubbles from any element inside the modal body
   to the body container's listener below. */
export const MODAL_DIRTY_RESET_EVENT = "kb:modal-dirty-reset";

export function notifyModalDirtyReset(source: HTMLElement | null) {
  source?.dispatchEvent(
    new CustomEvent(MODAL_DIRTY_RESET_EVENT, { bubbles: true }),
  );
}

export default function RouteModal({
  title,
  closeLabel,
  dirtyGuard,
  widthCls = "w-[min(94vw,46rem)]",
  children,
}: {
  title: string;
  closeLabel: string;
  /* dirtyGuard.destructive: closing really discards (default true —
     danger styling on the close button). Guards whose form auto-saves
     a local draft pass false: closing keeps the draft, so the button
     is a plain neutral action, not a danger one. */
  dirtyGuard?: {
    title: string;
    keep: string;
    discard: string;
    destructive?: boolean;
  };
  /* Modal width: 46rem by default; wide forms (work publish/edit) pass
     56rem. */
  widthCls?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /* The URL at mount (modal open = the URL sits on the intercepted
     route); silent marks a programmatic close — no router.back(), the
     background has already navigated. */
  const openedAt = useRef(pathname);
  const silent = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  /* Unsaved state dropped in place (notifyModalDirtyReset): the guard
     reason is gone — close directly again and take a standing confirm
     bar down with it. */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const reset = () => {
      setDirty(false);
      setConfirming(false);
    };
    body.addEventListener(MODAL_DIRTY_RESET_EVENT, reset);
    return () => body.removeEventListener(MODAL_DIRTY_RESET_EVENT, reset);
  }, []);

  /* Close backstop: a server action's redirect() moves only the
     background page — the intercepted @modal slot doesn't unmount with
     it (a saved form modal still covers the detail page). The URL
     departing the mount point means the background navigated: close
     silently, without going back — the URL is already where it
     belongs. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (pathname !== openedAt.current && dialog?.open) {
      silent.current = true;
      dialog.close();
    }
  }, [pathname]);

  /* Guard on and form dirty: closing reroutes to the confirm bar; with
     the bar up, ESC means keep editing. */
  const requestClose = () => {
    if (dirtyGuard && dirty && !confirming) {
      setConfirming(true);
      return;
    }
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={() => {
        /* A programmatic silent close (background navigated) never goes
           back; everything else (X/backdrop/ESC) uniformly returns to the
           source page. */
        if (silent.current) {
          silent.current = false;
          return;
        }
        router.back();
      }}
      onCancel={(event) => {
        if (dirtyGuard && dirty) {
          event.preventDefault();
          setConfirming(!confirming);
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className={`fixed inset-0 m-auto flex max-h-[86vh] flex-col ${widthCls} overflow-clip rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75`}
    >
      <div className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
        <h2 className="font-mono text-sm font-semibold tracking-[0.06em]">{title}</h2>
        <button
          type="button"
          onClick={requestClose}
          aria-label={closeLabel}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <X size={17} />
        </button>
      </div>
      <div
        ref={bodyRef}
        data-modal-body
        className={`min-h-0 flex-1 overscroll-contain overflow-y-auto px-6 py-6 [scrollbar-gutter:stable] ${
          confirming ? "[&_[data-modal-submit-row]]:hidden" : ""
        }`}
        onInput={() => {
          if (dirtyGuard && !dirty) setDirty(true);
        }}
        onChange={() => {
          if (dirtyGuard && !dirty) setDirty(true);
        }}
        onSubmit={() => {
          if (dirtyGuard) setDirty(false);
        }}
      >
        {children}
      </div>
      {confirming && dirtyGuard && (
        <div
          data-modal-confirm
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-card px-6 py-3"
        >
          <span className="text-xs text-paper">{dirtyGuard.title}</span>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {dirtyGuard.keep}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={`inline-flex min-h-9 items-center rounded-lg border px-3 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                dirtyGuard.destructive === false
                  ? "border-line text-paper hover:border-paper/30"
                  : "border-status-danger/50 text-status-danger-fg hover:bg-status-danger/10 focus-visible:outline-status-danger"
              }`}
            >
              {dirtyGuard.discard}
            </button>
          </span>
        </div>
      )}
    </dialog>
  );
}
