"use client";

/* Account deletion (B3, danger zone): the only irreversible-ish member
   action gets an in-app dialog with a typed-handle confirmation (the
   server re-checks the same string). On success the client drops the
   (now inert) session cookie and lands on the home facade. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert, X } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { deleteAccountAction } from "../actions";

export default function DeleteAccountButton({
  locale,
  handle,
}: {
  locale: Locale;
  handle: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteAccountAction, null);

  useEffect(() => {
    if (!state?.ok) return;
    /* The row is soft-deleted; the signed cookie is inert. Clear it and
       leave the (now anonymous) session on the facade. */
    document.cookie = "kb_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    router.push("/");
    router.refresh();
  }, [state, router]);

  const open = () => {
    setTyped("");
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-status-danger/50 px-3 font-mono text-xs text-status-danger-fg transition-colors hover:border-status-danger-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <TriangleAlert size={13} aria-hidden="true" />
        {t(locale, "set.deleteAccount")}
      </button>
      {mounted &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-labelledby="delete-account-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
            className="fixed left-1/2 top-[16vh] m-0 w-[min(92vw,26rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2
                id="delete-account-title"
                className="font-mono text-sm font-semibold text-paper"
              >
                {t(locale, "set.deleteTitle")}
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
            <form action={action} className="px-4 py-4">
              <p className="text-sm leading-6 text-grey">
                {t(locale, "set.deleteBody")}
              </p>
              <p className="mt-2 font-mono text-xs leading-5 text-grey">
                {t(locale, "set.deleteConfirmHint", { h: handle })}
              </p>
              <input
                name="confirm_handle"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label={t(locale, "set.deleteConfirmHint", { h: handle })}
                className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm text-paper outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              />
              {state?.error && state.error !== "auth" && (
                <p className="mt-2 font-mono text-xs text-status-danger-fg">
                  {state.error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-grey transition-colors hover:text-paper"
                >
                  {t(locale, "modal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending || typed !== handle}
                  className="rounded-lg bg-blue px-5 py-2 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  {pending
                    ? t(locale, "set.deleteSubmitting")
                    : t(locale, "set.deleteConfirm")}
                </button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
