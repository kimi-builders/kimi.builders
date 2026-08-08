"use client";

/* 编辑帖子表单(作者):标题/正文/链接可改;保存走 server action,成功回详情页。 */
import Link from "next/link";
import { useActionState } from "react";
import { updatePostAction, type PostFormState } from "../actions";
import { t, type Locale } from "@/src/lib/i18n";

const inputCls =
  "w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";

export default function PostEditForm({
  postId,
  type,
  initialTitle,
  initialBody,
  initialLinkUrl,
  locale,
}: {
  postId: number;
  type: string;
  initialTitle: string;
  initialBody: string;
  initialLinkUrl: string;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState<
    PostFormState | null,
    FormData
  >(updatePostAction, null);

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="post_id" value={postId} />
      <input
        name="title"
        defaultValue={initialTitle}
        placeholder={t(locale, "form.title")}
        maxLength={200}
        className={inputCls}
      />
      {type === "link" && (
        <input
          name="link_url"
          type="url"
          defaultValue={initialLinkUrl}
          placeholder="https://…"
          className={`${inputCls} font-mono`}
        />
      )}
      <textarea
        name="body"
        rows={10}
        defaultValue={initialBody}
        placeholder={t(locale, "form.bodyText")}
        className={inputCls}
      />
      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="border border-blue px-6 py-2 font-mono text-sm text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
        >
          {pending ? t(locale, "form.posting") : t(locale, "post.save")}
        </button>
        <Link
          href={`/community/${postId}`}
          className="font-mono text-xs text-grey transition-colors hover:text-paper"
        >
          {t(locale, "post.cancel")}
        </Link>
      </div>
    </form>
  );
}
