"use client";

/* 文章编辑表单(S3-1,admin/mod):slug/kind/locale/标题/摘要/sort_order/Markdown 正文
   + 发布勾选(不勾=存草稿)。新建与编辑共用;编辑态带软删按钮。
   提交走 server action(saveArticleAction),校验错误就地显示;风格对齐 PostForm。 */
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import {
  deleteArticleAction,
  saveArticleAction,
  type ArticleFormState,
} from "../actions";

const inputCls =
  "w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";

export interface ArticleFormInitial {
  id: number;
  slug: string;
  kind: "letter" | "guide";
  locale: "zh" | "en";
  title: string;
  summary: string;
  bodyMd: string;
  sortOrder: number;
  published: boolean;
}

export default function ArticleForm({
  locale,
  initial,
}: {
  locale: Locale;
  initial?: ArticleFormInitial;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<string>(initial?.kind ?? "letter");
  const [state, formAction, pending] = useActionState<
    ArticleFormState | null,
    FormData
  >(saveArticleAction, null);
  const [deleting, setDeleting] = useState(false);

  const del = async () => {
    if (!initial || deleting || !window.confirm(t(locale, "artf.deleteConfirm")))
      return;
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.set("id", String(initial.id));
      const res = await deleteArticleAction(fd);
      if (!res.ok) {
        toast(res.error ?? t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.deleted"));
      router.push(initial.kind === "guide" ? "/learn" : "/blog");
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="flex flex-wrap gap-2 font-mono text-xs">
        {(
          [
            { id: "letter", key: "artf.kindLetter" },
            { id: "guide", key: "artf.kindGuide" },
          ] as const
        ).map((k) => (
          <label
            key={k.id}
            className={`cursor-pointer border px-3 py-1.5 ${
              kind === k.id
                ? "border-blue text-blue"
                : "border-line text-grey hover:text-paper"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value={k.id}
              checked={kind === k.id}
              onChange={() => setKind(k.id)}
              className="sr-only"
            />
            {t(locale, k.key)}
          </label>
        ))}
        <select
          name="locale"
          defaultValue={initial?.locale ?? locale}
          className={`${inputCls} w-28 font-mono text-xs`}
          title={t(locale, "artf.locale")}
        >
          <option value="zh" className="bg-bg">
            中文
          </option>
          <option value="en" className="bg-bg">
            EN
          </option>
        </select>
      </div>

      <input
        name="slug"
        defaultValue={initial?.slug}
        placeholder={t(locale, "artf.slug")}
        maxLength={160}
        className={`${inputCls} font-mono`}
      />

      <input
        name="title"
        defaultValue={initial?.title}
        placeholder={t(locale, "artf.title")}
        maxLength={200}
        className={inputCls}
      />

      <textarea
        name="summary"
        rows={2}
        defaultValue={initial?.summary}
        placeholder={t(locale, "artf.summary")}
        maxLength={500}
        className={inputCls}
      />

      {kind === "guide" && (
        <input
          name="sort_order"
          type="number"
          min={0}
          max={9999}
          defaultValue={initial?.sortOrder ?? 0}
          placeholder={t(locale, "artf.sortOrder")}
          title={t(locale, "artf.sortOrder")}
          className={`${inputCls} w-56 font-mono`}
        />
      )}

      <textarea
        name="body"
        rows={16}
        defaultValue={initial?.bodyMd}
        placeholder={t(locale, "form.bodyText")}
        className={inputCls}
      />

      <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-grey">
        <input
          type="checkbox"
          name="publish"
          defaultChecked={initial?.published ?? false}
          className="accent-blue"
        />
        {t(locale, "artf.publish")}
      </label>

      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || deleting}
          className="border border-blue px-6 py-2 font-mono text-sm text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
        >
          {pending ? t(locale, "post.submitting") : t(locale, "post.save")}
        </button>
        {initial && (
          <button
            type="button"
            onClick={del}
            disabled={pending || deleting}
            className="font-mono text-xs text-grey transition-colors hover:text-blue disabled:opacity-40"
          >
            {deleting ? t(locale, "post.submitting") : t(locale, "post.delete")}
          </button>
        )}
      </div>
    </form>
  );
}
