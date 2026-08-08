"use client";

/* 作品提交/编辑共用表单:名称必填,链接/仓库至少其一(服务端校验);
   保存成功由 action redirect 回 /works。 */
import Link from "next/link";
import { useActionState } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import type { WorkFormState } from "../actions";

const inputCls =
  "w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none";

export default function WorkForm({
  action,
  locale,
  workId,
  initial,
}: {
  action: (prev: WorkFormState | null, formData: FormData) => Promise<WorkFormState>;
  locale: Locale;
  workId?: number;
  initial?: {
    name: string;
    tagline: string;
    url: string;
    repoUrl: string;
    screenshotUrl: string;
    tags: string[];
  };
}) {
  const [state, formAction, pending] = useActionState<WorkFormState | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {workId && <input type="hidden" name="work_id" value={workId} />}
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.name")} *
        </span>
        <input
          name="name"
          defaultValue={initial?.name}
          maxLength={120}
          required
          className={`${inputCls} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.tagline")}
        </span>
        <textarea
          name="tagline"
          rows={2}
          defaultValue={initial?.tagline}
          maxLength={300}
          className={`${inputCls} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.url")}
        </span>
        <input
          name="url"
          type="url"
          defaultValue={initial?.url}
          placeholder="https://…"
          maxLength={500}
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.repoUrl")}
        </span>
        <input
          name="repo_url"
          type="url"
          defaultValue={initial?.repoUrl}
          placeholder="https://github.com/…"
          maxLength={500}
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.shot")}
        </span>
        <input
          name="screenshot_url"
          type="url"
          defaultValue={initial?.screenshotUrl}
          placeholder="https://…"
          maxLength={500}
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] text-grey">
          {t(locale, "works.tags")}
        </span>
        <input
          name="tags"
          defaultValue={initial?.tags.join(", ")}
          placeholder="kimi, web, tool"
          className={`${inputCls} mt-1.5 font-mono`}
        />
      </label>
      <p className="text-[11px] leading-relaxed text-grey/80">
        {t(locale, "works.hint")}
      </p>
      {state?.error && (
        <p className="font-mono text-xs text-blue">{state.error}</p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="border border-blue px-6 py-2 font-mono text-sm text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
        >
          {pending ? t(locale, "set.saving") : t(locale, "set.save")}
        </button>
        <Link
          href="/works"
          className="font-mono text-xs text-grey transition-colors hover:text-paper"
        >
          {t(locale, "post.cancel")}
        </Link>
      </div>
    </form>
  );
}
