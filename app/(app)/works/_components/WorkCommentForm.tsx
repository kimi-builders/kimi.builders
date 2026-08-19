"use client";

/* 作品评论表单(P1-2):单层评论,登录可发(action 里限流,comment 配额)。
   成功 → toast + 清空 + router.refresh() 换新列表;失败文案由 action 带回(含限流等待秒数)。
   @kimi 召唤(20260816):召唤成功 → 「正在输入」占位行 + 轮询,回复到达自动刷新。 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownEditor from "@/app/(app)/_components/MarkdownEditor";
import { INPUT_CLS } from "@/components/form-classes";
import {
  SummonPendingRow,
  useSummonPending,
  type SummonTarget,
} from "@/app/(app)/_components/summon-pending";
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
  const [summon, setSummon] = useState<SummonTarget | null>(null);
  const settleSummon = useCallback(() => setSummon(null), []);
  useSummonPending({ target: summon, locale, onSettle: settleSummon });
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
      if (res.aiNote === "summoned") {
        toast(t(locale, "post.aiSummoned"));
        if (res.commentId) setSummon({ workCommentId: res.commentId });
      } else if (res.aiNote === "aiDisabled") toast(t(locale, "post.aiSummonDisabled"));
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
      {/* 召唤等待占位:AI 回复到达后轮询端自动 refresh 收走 */}
      {summon !== null && <SummonPendingRow locale={locale} />}
      <MarkdownEditor
        name="body"
        locale={locale}
        rows={3}
        required
        mentionKimi
        placeholder={t(locale, "post.commentPh")}
        inputCls={INPUT_CLS}
      />
      <button
        type="submit"
        disabled={posting}
 className="rounded-lg bg-blue px-5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {posting ? t(locale, "post.submitting") : t(locale, "post.comment")}
      </button>
    </form>
  );
}
