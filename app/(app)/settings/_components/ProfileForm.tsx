"use client";

/* 资料表单(设置页「资料」页签):显示名 / handle / 简介 / 头像 URL。
   保存成功 → toast + router.refresh()(顶栏头像、主页等处的资料随即更新);
   失败 → 行内错误(handle 占用/格式、长度、URL 校验都在服务端)。 */
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { updateProfileAction, type SettingsState } from "../actions";
import AvatarField from "./AvatarField";

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";
const labelCls = "text-xs text-grey";

export default function ProfileForm({
  initial,
  locale,
  hasCustomAvatar,
}: {
  initial: { handle: string; name: string; bio: string; avatarUrl: string };
  locale: Locale;
  /* 服务端判定:当前头像为站内自传 → 显示「恢复默认」 */
  hasCustomAvatar: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SettingsState | null,
    FormData
  >(updateProfileAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast(t(locale, "set.saved"));
      router.refresh();
    }
    // state 每次提交都是新对象,仅在 ok 时反馈一次
  }, [state, locale, router]);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className={labelCls}>
          {t(locale, "set.name")}
        </span>
        <input
          name="name"
          defaultValue={initial.name}
          maxLength={64}
          className={`${inputCls} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className={labelCls}>Handle</span>
        <span className="mt-1.5 flex items-center rounded-lg border border-line bg-bg focus-within:border-blue">
          <span className="pl-3 font-mono text-sm text-grey">@</span>
          <input
            name="handle"
            defaultValue={initial.handle}
            maxLength={28}
            className="w-full bg-transparent px-1.5 py-2.5 font-mono text-sm text-paper focus:outline-none"
          />
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-grey/80">
          {t(locale, "set.handleHint")}
        </span>
      </label>
      <label className="block">
        <span className={labelCls}>
          {t(locale, "set.bio")}
        </span>
        <textarea
          name="bio"
          rows={3}
          defaultValue={initial.bio}
          maxLength={300}
          className={`${inputCls} mt-1.5`}
        />
      </label>
      <AvatarField
        locale={locale}
        handle={initial.handle}
        currentUrl={initial.avatarUrl}
        hasCustom={hasCustomAvatar}
        inputCls={inputCls}
        labelCls={labelCls}
      />
      {state?.error && (
        <p className="text-xs text-status-danger-fg">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
 className="rounded-lg border border-blue bg-blue px-5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
      >
        {pending ? t(locale, "set.saving") : t(locale, "set.save")}
      </button>
    </form>
  );
}
