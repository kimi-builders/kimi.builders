"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import type { LoginError, LoginResult } from "@/src/lib/auth/login-response";
import { safeReturnTo } from "@/src/lib/auth/return-to";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";

const ERROR_KEYS: Record<LoginError, I18nKey> = {
  invalid_origin: "login.errOrigin",
  rate_limited: "login.errRate",
  bad_credentials: "login.errCredentials",
};

export default function LoginForm({
  locale, next, initialEmail = "", initialError, inputCls, submitCls,
}: {
  locale: Locale;
  next: string;
  initialEmail?: string;
  initialError?: I18nKey;
  inputCls: string;
  submitCls: string;
}) {
  const id = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ key: I18nKey } | null>(
    initialError ? { key: initialError } : null,
  );
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (failure) passwordRef.current?.focus();
  }, [failure]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const controller = new AbortController();
    inFlight.current = controller;
    const body = new FormData(form);
    setPending(true);
    setFailure(null);
    let error: I18nKey = "login.errNetwork";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
        signal: controller.signal,
        redirect: "error",
      });
      const result: LoginResult = await response.json();
      if (controller.signal.aborted) return;
      if (response.ok && result.ok === true && typeof result.next === "string") {
        // Reload the authenticated shell and discard the intercepted slot, including same-page next targets.
        window.location.replace(safeReturnTo(result.next));
        return;
      }
      if (result.ok === false) error = ERROR_KEYS[result.error] ?? "login.errNetwork";
    } catch {
      // Network failures stay retryable without exposing server details or submitted credentials.
    } finally {
      if (passwordRef.current) passwordRef.current.value = "";
      body.delete("password");
    }
    if (controller.signal.aborted) return;
    inFlight.current = null;
    setPending(false);
    setFailure({ key: error });
  }

  return (
    <form method="POST" action={`/api/auth/email/login${query}`} onSubmit={submit} aria-busy={pending} className="mt-4 space-y-3">
      {failure && (
        <p id={`${id}-error`} role="alert" className="rounded-lg border border-line bg-moon px-3 py-2 text-xs text-status-danger-fg">
          {t(locale, failure.key)}
        </p>
      )}
      <fieldset disabled={pending} className="space-y-3">
        <div>
          <label className="mb-1 block font-mono text-xs text-grey" htmlFor={`${id}-email`}>
            {t(locale, "auth.email")}
          </label>
          <input id={`${id}-email`} name="email" type="email" required autoComplete="email" defaultValue={initialEmail} className={inputCls} />
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="block font-mono text-xs text-grey" htmlFor={`${id}-password`}>
              {t(locale, "login.password")}
            </label>
            <Link href={`/login?mode=forgot${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`} className="font-mono text-xs text-grey transition-colors hover:text-paper">
              {t(locale, "login.forgot")}
            </Link>
          </div>
          <input ref={passwordRef} id={`${id}-password`} name="password" type="password" required autoComplete="current-password" aria-invalid={failure?.key === "login.errCredentials" || undefined} aria-describedby={failure ? `${id}-error` : undefined} className={inputCls} />
        </div>
        <button type="submit" disabled={pending} className={`${submitCls} disabled:cursor-wait disabled:opacity-60`}>
          <Mail size={12} aria-hidden="true" className="mr-1 inline" /> {t(locale, pending ? "login.signingIn" : "login.signIn")}
        </button>
      </fieldset>
    </form>
  );
}
