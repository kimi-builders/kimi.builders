"use client";

/* 密码表单(设置页「账号」页签):已有密码需先验证当前密码;
   OAuth 注册的无密码账号直接设置(登录会话即凭证)。
   成功 → toast + 清表单 + router.refresh()(hasPassword 翻转、按钮文案切换);
   失败 → 行内错误(当前密码不对/策略/两次不一致都在服务端判定)。 */
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

/* 控件样式收编到共享 form-classes(20260819 版式对齐);LABEL_CLS 自带 mb-1.5,
   原输入框上的 mt-1.5 相应移除(同距不叠双份)。 */
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
