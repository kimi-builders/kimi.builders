"use client";

/* 密码表单(设置页「账号」页签):已有密码需先验证当前密码;
   OAuth 注册的无密码账号直接设置(登录会话即凭证)。
   成功 → toast + 清表单 + router.refresh()(hasPassword 翻转、按钮文案切换);
   失败 → 行内错误(当前密码不对/策略/两次不一致都在服务端判定)。 */
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { changePasswordAction, type SettingsState } from "../actions";

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";
const labelCls = "font-mono text-[11px] text-grey";

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
    // state 每次提交都是新对象,仅在 ok 时反馈一次
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
            className={`${inputCls} mt-1.5`}
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
          className={`${inputCls} mt-1.5`}
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
          className={`${inputCls} mt-1.5`}
        />
      </label>
      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-blue bg-blue px-5 py-2 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
      >
        {pending
          ? t(locale, "set.saving")
          : t(locale, hasPassword ? "set.pwSubmit" : "set.pwSubmitSet")}
      </button>
    </form>
  );
}
