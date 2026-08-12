"use client";

/* 作品评论行内删除(P1-2):confirm 后软删,toast 反馈 + router.refresh() 换新数据。
   入口只渲染给评论作者本人/作品作者(服务端算 canDelete),action 层 SQL 再校验一次。 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
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

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(t(locale, "post.commentDeleteConfirm"))) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("comment_id", String(commentId));
      fd.set("work_id", String(workId));
      const res = await deleteWorkCommentAction(fd);
      if (!res.ok) {
        toast(res.error || t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.deleted"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="transition-colors hover:text-paper disabled:opacity-40"
    >
      {busy ? t(locale, "post.submitting") : t(locale, "post.delete")}
    </button>
  );
}
