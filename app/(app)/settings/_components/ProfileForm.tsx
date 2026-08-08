"use client";

/* 资料表单(设置页):显示名 / handle / 简介 / 头像 URL。
   保存成功 → toast + router.refresh()(顶栏头像、主页等处的资料随即更新);
   失败 → 行内错误(handle 占用/格式、长度、URL 校验都在服务端)。 */
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { updateProfileAction, type SettingsState } from "../actions";

const inputCls =
  "w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";

export default function ProfileForm({
  initial,
  locale,
}: {
  initial: { handle: string; name: string; bio: string; avatarUrl: string };
  locale: Locale;
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
    <form action={formAction} className="mt-4 space-y-4">
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
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
        <span className="font-mono text-[11px] text-grey">Handle</span>
        <span className="mt-1.5 flex items-center border border-line focus-within:border-blue">
          <span className="pl-3 font-mono text-sm text-grey">@</span>
          <input
            name="handle"
            defaultValue={initial.handle}
            maxLength={28}
            className="w-full bg-transparent px-1 py-2 font-mono text-sm text-paper focus:outline-none"
          />
        </span>
        <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
          {t(locale, "set.handleHint")}
        </span>
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
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
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "set.avatar")}
        </span>
        <input
          name="avatar_url"
          type="url"
          placeholder={initial.avatarUrl || "https://…"}
          maxLength={500}
          className={`${inputCls} mt-1.5 font-mono`}
        />
        <span className="mt-1 block text-[11px] leading-relaxed text-grey/80">
          {t(locale, "set.avatarHint")}
        </span>
      </label>
      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="border border-blue px-6 py-2 font-mono text-sm text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
      >
        {pending ? t(locale, "set.saving") : t(locale, "set.save")}
      </button>
    </form>
  );
}
