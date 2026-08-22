"use client";

/* Password form (the settings "account" tab): accounts with a
   password verify the current one first; OAuth-signup accounts without
   one set it directly (the session is the credential). Success ->
   toast + clear the form + router.refresh() (hasPassword flips, button
   copy switches); failure -> inline errors (wrong current password /
   policy / mismatch — all decided server-side). */
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FORM_BTN_PRIMARY,
  INPUT_CLS,
  LABEL_CLS,
} from "@/components/form-classes";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { changePasswordAction, type SettingsState } from "../actions";

/* Control styles consolidated into the shared form-classes; LABEL_CLS
   carries mb-1.5, so the old mt-1.5 on inputs was removed (same gap,
   not doubled). */
const inputCls = INPUT_CLS;
const labelCls = LABEL_CLS;

export default function PasswordForm({
  locale,
  hasPassword,
}: {
  locale: Locale;
  hasPassword: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SettingsState | null,
    FormData
  >(changePasswordAction, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast(t(locale, "set.pwChanged"));
      formRef.current?.reset();
      router.refresh();
    }
    // state is a fresh object per submit; feedback fires only on ok
  }, [state, locale, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {hasPassword && (
        <label className="block">
          <span className={labelCls}>{t(locale, "set.pwCurrent")}</span>
          <input
            name="current_password"
            type="password"
            required
            autoComplete="current-password"
            className={inputCls}
          />
        </label>
      )}
      <label className="block">
        <span className={labelCls}>{t(locale, "login.newPassword8")}</span>
        <input
          name="new_password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className={labelCls}>{t(locale, "login.confirmNewPassword")}</span>
        <input
          name="confirm_password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          className={inputCls}
        />
      </label>
      {state?.error && (
        <p className="text-xs text-status-danger-fg">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
 className={FORM_BTN_PRIMARY}
      >
        {pending
          ? t(locale, "set.saving")
          : t(locale, hasPassword ? "set.pwSubmit" : "set.pwSubmitSet")}
      </button>
    </form>
  );
}
