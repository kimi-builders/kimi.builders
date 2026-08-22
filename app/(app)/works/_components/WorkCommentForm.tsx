"use client";

/* Work comment form: single-level, signed-in users only (the action
   rate-limits via the comment quota). Success -> toast + clear +
   router.refresh() for the fresh list; failure copy comes back from
   the action (rate-limit wait seconds included). @kimi summon: on
   success a "typing" placeholder row + polling auto-refreshes when the
   reply lands. */
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
      /* @kimi summon outcome (reusing the community's three keys): the
         comment publishes either way; whether the summon took is a
         separate notice. */
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
      {/* Summon-wait placeholder: cleared automatically when the poller refreshes on AI-reply arrival */}
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
