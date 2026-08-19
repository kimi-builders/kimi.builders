"use client";

/* 编辑帖子表单(作者):板块/标题/正文/链接可改(类型与投票选项不改——类型决定
   帖子结构,保持简单);保存走 server action,成功回详情页。
   视觉与发帖表单(PostForm)同套语言:标签 + rounded-lg 输入 + 自绘 chevron 下拉。 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { CATEGORIES } from "@/src/lib/categories";
import {
  FORM_BTN_GHOST,
  FORM_BTN_PRIMARY,
  INPUT_CLS,
  LABEL_CLS,
} from "@/components/form-classes";
import { t, type Locale } from "@/src/lib/i18n";
import { updatePostAction, type PostFormState } from "../actions";
import MarkdownEditor from "../../_components/MarkdownEditor";

/* 控件样式收编到共享 form-classes(20260819 版式对齐);别名保留,调用点不动 */
const inputCls = INPUT_CLS;
const labelCls = LABEL_CLS;

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
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="post_id" value={postId} />

      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div>
          <label htmlFor="edit-category" className={labelCls}>
            {t(locale, "form.topic")} <span className="text-ui-blue">*</span>
          </label>
          {/* 同发帖表单:原生 select 换自绘箭头(与筛选下拉同款) */}
          <div className="relative">
            <select
              id="edit-category"
              name="category"
              defaultValue={initialCategory}
              className={`${inputCls} cursor-pointer appearance-none pr-9`}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-bg">
                  {locale === "zh" ? c.zh : c.en}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-grey"
            />
          </div>
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
            {t(locale, "form.link")} URL <span className="text-ui-blue">*</span>
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
        <div className="mt-2 flex items-center justify-between font-mono text-xs text-grey/70">
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
          className={FORM_BTN_GHOST}
        >
          {t(locale, "post.cancel")}
        </Link>
        <button
          type="submit"
          disabled={pending}
 className={`ml-auto shrink-0 ${FORM_BTN_PRIMARY}`}
        >
          {pending ? t(locale, "form.posting") : t(locale, "post.save")}
        </button>
      </div>
    </form>
  );
}
