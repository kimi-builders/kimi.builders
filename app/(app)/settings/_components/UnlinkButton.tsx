"use client";

/* 解绑按钮(设置页「账号」页签,已绑定的 provider 行内):
   提交前 confirm 兜底;守卫(唯一登录方式)在服务端事务里重查。
   成功 → toast + router.refresh();失败 → 行内错误。 */
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { unlinkProviderAction, type SettingsState } from "../actions";

export default function UnlinkButton({
  locale,
  provider,
  providerName,
}: {
  locale: Locale;
  provider: "github" | "google";
  providerName: string;
}) {
  const [state, formAction, pending] = useActionState<
    SettingsState | null,
    FormData
  >(unlinkProviderAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast(t(locale, "set.unlinkedOk", { p: providerName }));
      router.refresh();
    }
  }, [state, locale, router, providerName]);

  return (
    <form
      action={formAction}
      className="ml-auto shrink-0"
      onSubmit={(e) => {
        if (!window.confirm(t(locale, "set.unlinkConfirm", { p: providerName })))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-blue hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
      >
        {pending ? "…" : t(locale, "set.unlink")}
      </button>
      {state?.error && (
        <p className="mt-1 text-right font-mono text-[11px] text-blue">
          {state.error}
        </p>
      )}
    </form>
  );
}
