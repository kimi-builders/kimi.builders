"use client";

/* useConfirm / usePrompt: in-app replacements for window.confirm and
   window.prompt. Native dialogs can't be localized, styled, or carry
   object-specific copy — the brand rules require delete confirmations
   to name the object and its irreversibility. Imperative shape keeps
   call sites at one line:
   `if (!(await confirm({ body: t(...) }))) return;` plus
   rendering {node} once. All body/label copy comes from the caller's
   i18n keys; shared title/button copy lives in the modal.* keys.
   Both hooks render through one DialogShell so every moderation and
   delete dialog shares the exact same chrome — header bar with the
   title + close, hairline-separated footer with the action row — the
   same grammar as the feedback and delete-account dialogs. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { t } from "@/src/lib/i18n";
import type { Locale } from "@/src/lib/i18n";

const CANCEL_BTN =
  "rounded-lg border border-line px-4 py-2 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

/* One confirm color everywhere: the destructive intent is already
   carried by the dialog copy; a second button color read as noise. */
const ACTION_BTN =
  "rounded-lg bg-blue px-5 py-2 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

/* The shared dialog frame: fixed 26rem card at the site modal position,
   header (title + close key) over border-b, body, footer over border-t. */
function DialogShell({
  titleId,
  title,
  locale,
  onClose,
  dialogRef,
  onCancel,
  children,
  footer,
}: {
  titleId: string;
  title: string;
  locale: Locale;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onCancel: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={onCancel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed left-1/2 top-[16vh] m-0 w-[min(92vw,26rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id={titleId} className="font-mono text-sm font-semibold text-paper">
          {title}
        </h2>
        <CloseKey onClick={onClose} locale={locale} />
      </div>
      <div className="px-4 py-4">{children}</div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
        {footer}
      </div>
    </dialog>
  );
}

/* Close affordance shared by both hooks: an icon key in the header,
   same grammar as the feedback/delete-account dialogs. */
function CloseKey({ onClick, locale }: { onClick: () => void; locale: Locale }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tip={t(locale, "modal.close")}
      data-tip-side="bottom"
      data-tip-align="right"
      aria-label={t(locale, "modal.close")}
      className="flex size-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
    >
      <X size={16} aria-hidden="true" />
    </button>
  );
}

export interface ConfirmOptions {
  body: string;
  /* Override for the generic confirm-button copy (rare: when a more
     specific verb than plain "confirm" reads better). */
  confirmText?: string;
}

export function useConfirm(
  locale: Locale,
): { confirm: (opts: ConfirmOptions) => Promise<boolean>; node: ReactNode } {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const settle = useCallback((result: boolean) => {
    dialogRef.current?.close();
    setOpts(null);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (opts) dialogRef.current?.showModal();
  }, [opts]);

  const node =
    mounted && opts
      ? createPortal(
          <DialogShell
            titleId="kb-confirm-title"
            title={t(locale, "modal.confirmTitle")}
            locale={locale}
            onClose={() => settle(false)}
            onCancel={() => settle(false)}
            dialogRef={dialogRef}
            footer={
              <>
                <button type="button" onClick={() => settle(false)} className={CANCEL_BTN}>
                  {t(locale, "modal.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => settle(true)}
                  autoFocus
                  className={ACTION_BTN}
                >
                  {opts.confirmText ?? t(locale, "modal.confirm")}
                </button>
              </>
            }
          >
            <p className="text-sm leading-6 text-grey">{opts.body}</p>
          </DialogShell>,
          document.body,
        )
      : null;

  return { confirm, node };
}

export interface PromptOptions {
  title: string;
  label: string;
  /* Optional starter text in the input (the hide/mute reasons start
     empty). */
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  confirmText?: string;
  /* When set, an empty submit is refused inline (e.g. a hide reason is
     required). */
  required?: boolean;
}

/* usePrompt: the text-input sibling of useConfirm, replacing
   window.prompt for moderator reason entry — same imperative shape
   (`const text = await prompt({...})`, null = cancelled), same dialog
   chrome via DialogShell. */
export function usePrompt(
  locale: Locale,
): { prompt: (opts: PromptOptions) => Promise<string | null>; node: ReactNode } {
  const [opts, setOpts] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const settle = useCallback((result: string | null) => {
    dialogRef.current?.close();
    setOpts(null);
    setTouched(false);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  const prompt = useCallback(
    (o: PromptOptions) => {
      setOpts(o);
      setValue(o.defaultValue ?? "");
      return new Promise<string | null>((resolve) => {
        resolver.current = resolve;
      });
    },
    [],
  );

  useEffect(() => {
    if (opts) dialogRef.current?.showModal();
  }, [opts]);

  const emptyInvalid = !!opts?.required && value.trim().length === 0;

  const node =
    mounted && opts
      ? createPortal(
          <DialogShell
            titleId="kb-prompt-title"
            title={opts.title}
            locale={locale}
            onClose={() => settle(null)}
            onCancel={() => settle(null)}
            dialogRef={dialogRef}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => settle(null)}
                  className={CANCEL_BTN}
                >
                  {t(locale, "modal.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (emptyInvalid) {
                      setTouched(true);
                      return;
                    }
                    settle(value);
                  }}
                  autoFocus
                  className={ACTION_BTN}
                >
                  {opts.confirmText ?? t(locale, "modal.confirm")}
                </button>
              </>
            }
          >
            <label
              htmlFor="kb-prompt-input"
              className="block font-mono text-xs text-grey"
            >
              {opts.label}
            </label>
            <input
              id="kb-prompt-input"
              value={value}
              onChange={(e) => setValue(e.target.value.slice(0, opts.maxLength ?? 280))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (emptyInvalid) {
                    setTouched(true);
                    return;
                  }
                  settle(value);
                }
              }}
              placeholder={opts.placeholder}
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-paper outline-none placeholder:text-grey/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            />
            {touched && emptyInvalid && (
              <p className="mt-1.5 font-mono text-xs text-status-danger-fg">
                {t(locale, "modal.required")}
              </p>
            )}
          </DialogShell>,
          document.body,
        )
      : null;

  return { prompt, node };
}
