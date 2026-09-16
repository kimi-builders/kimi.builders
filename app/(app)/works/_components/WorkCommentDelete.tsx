"use client";

/* Inline work-comment delete: confirm, soft delete, toast +
   router.refresh() for fresh data. The entry renders only for the
   comment author / work author (server-computed canDelete); the action
   layer re-validates in SQL. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { useConfirm } from "@/components/useConfirm";
import { deleteWorkCommentAction } from "../actions";

export default function WorkCommentDelete({
  commentId,
  workId,
  locale,
}: {
  commentId: number;
  workId: number;
  locale: Locale;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { confirm, node } = useConfirm(locale);

  const remove = async () => {
    if (busy) return;
    if (
      !(await confirm({ body: t(locale, "post.commentDeleteConfirm"), danger: true }))
    )
      return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("comment_id", String(commentId));
      fd.set("work_id", String(workId));
      const res = await deleteWorkCommentAction(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.deleted"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="transition-colors hover:text-paper disabled:opacity-40"
      >
        {busy ? t(locale, "post.submitting") : t(locale, "post.delete")}
      </button>
      {node}
    </>
  );
}
