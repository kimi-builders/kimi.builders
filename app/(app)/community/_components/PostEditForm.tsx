"use client";

/* 编辑帖子表单(作者):板块/标题/正文/链接可改(类型与投票选项不改——类型决定
   帖子结构,保持简单);保存走 server action,成功回详情页。
   视觉与发帖表单(PostForm)同套语言:标签 + rounded-lg 输入 + 自绘 chevron 下拉。 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { CATEGORIES } from "@/src/lib/categories";
import { t, type Locale } from "@/src/lib/i18n";
import { updatePostAction, type PostFormState } from "../actions";
import MarkdownEditor from "../../_components/MarkdownEditor";

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] text-paper transition-colors placeholder:text-grey/50 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10";
const labelCls = "mb-1.5 block text-[11.5px] text-grey";

export default function PostEditForm({
  postId,
  type,
  initialCategory,
  initialTitle,
  initialBody,
  initialLinkUrl,
  locale,
}: {
  postId: number;
  type: string;
  initialCategory: string;
  initialTitle: string;
  initialBody: string;
  initialLinkUrl: string;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState<
    PostFormState | null,
    FormData
  >(updatePostAction, null);

  /* 同发帖:保存成功由客户端导航落详情页,弹窗随之卸载 */
  const router = useRouter();
  useEffect(() => {
    if (state?.ok && state.postId) router.push(`/community/${state.postId}`);
  }, [state, router]);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="post_id" value={postId} />

      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div>
          <label htmlFor="edit-category" className={labelCls}>
            {t(locale, "form.topic")} <span className="text-blue">*</span>
          </label>
          <select
            id="edit-category"
            name="category"
            defaultValue={initialCategory}
            className={`${inputCls} cursor-pointer`}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="bg-bg">
                {locale === "zh" ? c.zh : c.en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="edit-title" className={labelCls}>
            {t(locale, "form.titleLabel")}{" "}
            <span className="text-grey/70">{t(locale, "form.optional")}</span>
          </label>
          <input
            id="edit-title"
            name="title"
            defaultValue={initialTitle}
            placeholder={t(locale, "form.title")}
            maxLength={200}
            className={inputCls}
          />
        </div>
      </div>

      {type === "link" && (
        <div>
          <label htmlFor="edit-link" className={labelCls}>
            {t(locale, "form.link")} URL <span className="text-blue">*</span>
          </label>
          <input
            id="edit-link"
            name="link_url"
            type="url"
            defaultValue={initialLinkUrl}
            placeholder="https://…"
            className={`${inputCls} font-mono`}
          />
        </div>
      )}

      <div>
        <label htmlFor="edit-body" className={labelCls}>
          {t(locale, "form.bodyLabel")}
        </label>
        <MarkdownEditor
          id="edit-body"
          name="body"
          locale={locale}
          rows={10}
          defaultValue={initialBody}
          placeholder={t(locale, "form.bodyText")}
          inputCls={inputCls}
        />
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-grey/70">
          <span>{t(locale, "form.mdHint")}</span>
          <span>{t(locale, "form.mdSupport")}</span>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="rounded-lg border border-line bg-moon px-3 py-2 text-xs text-paper">{state.error}</p>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Link
          href={`/community/${postId}`}
          className="inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-[11px] text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {t(locale, "post.cancel")}
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="ml-auto inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40"
        >
          {pending ? t(locale, "form.posting") : t(locale, "post.save")}
        </button>
      </div>
    </form>
  );
}
