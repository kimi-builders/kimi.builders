"use client";

/* Account security block (settings "account" tab): email verification
   state + change-email flow, and the device/session registry with
   per-device revoke and log-out-everywhere. Server data arrives as
   props (email, verified, pending change, session rows); every write is
   a server action re-checked there. */
import { useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { relTime } from "@/src/lib/format";
import { toast } from "@/src/lib/toast";
import {
  changeEmailAction,
  logoutEverywhereAction,
  resendVerifyEmailAction,
  revokeSessionAction,
} from "../actions";

export interface SessionRowView {
  id: number;
  ua: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export default function AccountSecurity({
  locale,
  email,
  verified,
  hasPassword,
  pendingNewEmail,
  sessions,
}: {
  locale: Locale;
  email: string | null;
  verified: boolean;
  hasPassword: boolean;
  pendingNewEmail: string | null;
  sessions: SessionRowView[];
}) {
  const router = useRouter();
  const [resendState, resendAction, resendPending] = useActionState(
    async () => resendVerifyEmailAction(),
    null,
  );
  const [changeState, changeAction, changePending] = useActionState(
    changeEmailAction,
    null,
  );

  useEffect(() => {
    if (resendState?.ok) toast(t(locale, "set.resendDone"));
  }, [resendState, locale]);
  useEffect(() => {
    if (changeState?.ok) {
      toast(t(locale, "set.emailChangeSent"));
      router.refresh();
    }
  }, [changeState, locale, router]);

  const logoutAll = async () => {
    const res = await logoutEverywhereAction();
    if (res.ok) {
      document.cookie = "kb_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      toast(t(locale, "set.logoutEverywhereDone"));
      router.push("/");
      router.refresh();
    }
  };

  const inputCls =
    "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-paper outline-none placeholder:text-grey/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

  return (
    <>
      {/* Email & verification */}
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-paper">
          {t(locale, "set.emailTitle")}
        </h3>
        {email ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs text-paper">{email}</span>
              {verified ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-status-ok/50 px-1.5 py-px font-mono text-xs text-status-ok">
                  <ShieldCheck size={11} aria-hidden="true" />
                  {t(locale, "set.emailVerified")}
                </span>
              ) : (
                <span className="rounded-md border border-status-warn/60 px-1.5 py-px font-mono text-xs text-status-warn-fg">
                  {t(locale, "set.emailUnverified")}
                </span>
              )}
              {!verified && (
                <form action={resendAction}>
                  <button
                    type="submit"
                    disabled={resendPending}
                    className="rounded-lg border border-line px-3 py-1.5 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                  >
                    {t(locale, "set.resend")}
                  </button>
                </form>
              )}
            </div>
            {!verified && (
              <p className="mt-1.5 text-xs leading-relaxed text-grey">
                {t(locale, "set.emailUnverifiedHint")}
              </p>
            )}
            {pendingNewEmail && (
              <p className="mt-2 rounded-lg border border-blue/40 px-3 py-2 text-xs leading-relaxed text-ui-blue">
                {t(locale, "set.pendingChange", { e: pendingNewEmail })}
              </p>
            )}
            {/* Change email: confirmed from the NEW mailbox before it
                takes effect. */}
            <p className="mt-3 max-w-lg text-xs leading-relaxed text-grey">
              {t(locale, "set.changeEmailHint")}
            </p>
            <form action={changeAction} className="mt-3 flex max-w-md flex-col gap-2">
              <input
                name="email"
                type="email"
                required
                placeholder={t(locale, "set.newEmailPh")}
                className={inputCls}
              />
              {hasPassword && (
                <input
                  name="current_password"
                  type="password"
                  required
                  placeholder={t(locale, "set.pwCurrent")}
                  className={inputCls}
                />
              )}
              {changeState?.error && changeState.error !== "auth" && (
                <p className="font-mono text-xs text-status-danger-fg">
                  {changeState.error}
                </p>
              )}
              <button
                type="submit"
                disabled={changePending}
                className="self-start rounded-lg border border-line px-4 py-2 font-mono text-xs text-paper transition-colors hover:border-ui-blue disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                {t(locale, "set.changeEmail")}
              </button>
            </form>
          </>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-grey">
            {t(locale, "set.noEmail")}
          </p>
        )}
      </div>

      {/* Devices & sessions */}
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-paper">
          {t(locale, "set.sessionsTitle")}
        </h3>
        <p className="mt-1 max-w-lg text-xs leading-relaxed text-grey">
          {t(locale, "set.sessionsHint")}
        </p>
        <ul className="mt-3 space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2.5"
            >
              <span className="font-mono text-xs text-paper">{s.ua}</span>
              {s.current && (
                <span className="rounded-md border border-blue/60 px-1.5 py-px font-mono text-xs text-blue">
                  {t(locale, "set.currentDevice")}
                </span>
              )}
              <span className="font-mono text-xs text-grey">
                {t(locale, "set.signedInAt", { t: relTime(s.createdAt, locale) })}
              </span>
              <span className="font-mono text-xs text-grey/70">
                {t(locale, "set.lastSeen", { t: relTime(s.lastSeenAt, locale) })}
              </span>
              {!s.current && (
                <form action={revokeSessionAction} className="ml-auto">
                  <input type="hidden" name="session_id" value={s.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-line px-3 py-1.5 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                  >
                    {t(locale, "set.revoke")}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={logoutAll}
          className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "set.logoutEverywhere")}
        </button>
      </div>
    </>
  );
}
