"use client";

/* 作品评论表单(P1-2):单层评论,登录可发(action 里限流,comment 配额)。
   成功 → toast + 清空 + router.refresh() 换新列表;失败文案由 action 带回(含限流等待秒数)。 */
import { useState } from "react";
import { useRouter } from "next/navigation";
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
        toast(res.error || t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.commented"));
      form.reset();
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setPosting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 space-y-3">
      <input type="hidden" name="work_id" value={workId} />
      <textarea
        name="body"
        rows={3}
        required
        placeholder={t(locale, "post.commentPh")}
        className="w-full border border-line bg-transparent px-3 py-2 text-sm text-paper placeholder:text-grey/60 focus:border-blue focus:outline-none"
      />
      <button
        type="submit"
        disabled={posting}
        className="border border-blue px-5 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg disabled:opacity-40"
      >
        {posting ? t(locale, "post.submitting") : t(locale, "post.comment")}
      </button>
    </form>
  );
}
