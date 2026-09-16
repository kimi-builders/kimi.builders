"use client";

/* useConfirm: in-app replacement for window.confirm (B6). Native
   dialogs can't be localized, styled, or carry object-specific copy —
   the brand rules require delete confirmations to name the object and
   its irreversibility. Imperative shape keeps call sites at one line:
   `if (!(await confirm({ body: t(...), danger: true }))) return;` plus
   rendering {node} once. All copy (body) comes from the caller's
   existing i18n keys; title/buttons share the generic modal keys. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "@/src/lib/i18n";
import type { Locale } from "@/src/lib/i18n";

export interface ConfirmOptions {
  body: string;
  danger?: boolean;
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
          <dialog
            ref={dialogRef}
            aria-labelledby="kb-confirm-title"
            /* Esc is a cancel, same as the backdrop click. */
            onCancel={() => settle(false)}
            onClick={(e) => {
              if (e.target === e.currentTarget) settle(false);
            }}
            className="fixed left-1/2 top-[18vh] m-0 w-[min(92vw,24rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
          >
            <div className="px-4 py-4">
              <h2
                id="kb-confirm-title"
                className="font-mono text-sm font-semibold text-paper"
              >
                {t(locale, "modal.confirmTitle")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-grey">{opts.body}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                {t(locale, "modal.cancel")}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                autoFocus
                className={`rounded-lg px-5 py-2 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
                  opts.danger ? "bg-status-danger-fg" : "bg-blue"
                }`}
              >
                {opts.confirmText ?? t(locale, "modal.confirm")}
              </button>
            </div>
          </dialog>,
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
   grammar. Native prompt is unlocalizable, unstyleable, and invisible
   to automation. */
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
          <dialog
            ref={dialogRef}
            aria-labelledby="kb-prompt-title"
            onCancel={() => settle(null)}
            onClick={(e) => {
              if (e.target === e.currentTarget) settle(null);
            }}
            className="fixed left-1/2 top-[18vh] m-0 w-[min(92vw,24rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card p-0 text-paper backdrop:bg-bg/80 backdrop:backdrop-blur-sm"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (emptyInvalid) {
                  setTouched(true);
                  return;
                }
                settle(value);
              }}
              className="px-4 py-4"
            >
              <h2
                id="kb-prompt-title"
                className="font-mono text-sm font-semibold text-paper"
              >
                {opts.title}
              </h2>
              <label
                htmlFor="kb-prompt-input"
                className="mt-3 block font-mono text-xs text-grey"
              >
                {opts.label}
              </label>
              <input
                id="kb-prompt-input"
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, opts.maxLength ?? 280))}
                placeholder={opts.placeholder}
                autoFocus
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-paper outline-none placeholder:text-grey/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              />
              {touched && emptyInvalid && (
                <p className="mt-1.5 font-mono text-xs text-status-danger-fg">
                  {t(locale, "modal.required")}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => settle(null)}
                  className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  {t(locale, "modal.cancel")}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue px-5 py-2 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  {opts.confirmText ?? t(locale, "modal.confirm")}
                </button>
              </div>
            </form>
          </dialog>,
          document.body,
        )
      : null;

  return { prompt, node };
}
