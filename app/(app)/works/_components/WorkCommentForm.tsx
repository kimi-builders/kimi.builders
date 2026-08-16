"use client";

/* 作品评论表单(P1-2):单层评论,登录可发(action 里限流,comment 配额)。
   成功 → toast + 清空 + router.refresh() 换新列表;失败文案由 action 带回(含限流等待秒数)。 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownEditor from "@/app/(app)/_components/MarkdownEditor";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { createWorkCommentAction } from "../actions";

export default function WorkCommentForm({
  workId,
  locale,
}: {
  workId: number;
  locale: Locale;
}) {
  const [posting, setPosting] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (posting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPosting(true);
    try {
      const res = await createWorkCommentAction(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.commented"));
      /* @kimi 召唤结果(20260816 PR2,复用社区三个 key):评论照常发出,
         召唤是否成立单独提示 */
      if (res.aiNote === "summoned") toast(t(locale, "post.aiSummoned"));
      else if (res.aiNote === "aiDisabled") toast(t(locale, "post.aiSummonDisabled"));
      else if (res.aiNote === "rate") toast(t(locale, "post.aiSummonRate"));
      form.reset();
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setPosting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-line pt-4">
      <input type="hidden" name="work_id" value={workId} />
      <MarkdownEditor
        name="body"
        locale={locale}
        rows={3}
        required
        placeholder={t(locale, "post.commentPh")}
        inputCls="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10"
      />
      <button
        type="submit"
        disabled={posting}
        className="rounded-lg bg-blue px-5 py-2 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {posting ? t(locale, "post.submitting") : t(locale, "post.comment")}
      </button>
    </form>
  );
}
