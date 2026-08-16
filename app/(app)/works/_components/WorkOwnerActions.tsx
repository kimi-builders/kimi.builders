"use client";

/* 作品卡片的作者动作:编辑(跳 /works/[id]/edit)+ 删除(confirm → toast → refresh)。
   仅本人卡片渲染(服务端判断后挂载)。compact=网格卡紧凑态:只留图标
   (title/aria-label 提示),避免与支持/访问/源码挤在一行(20260918)。 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SquarePen, Trash2 } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { deleteWorkAction } from "../actions";

export default function WorkOwnerActions({
  workId,
  locale,
  redirectTo,
  compact = false,
}: {
  workId: number;
  locale: Locale;
  /* 详情页删除后要跳走(refresh 会停在「已撤下」页);卡片场景缺省 refresh */
  redirectTo?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(t(locale, "works.deleteConfirm"))) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("work_id", String(workId));
      const res = await deleteWorkAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"), "error");
        return;
      }
      toast(t(locale, "toast.deleted"));
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch {
      toast(t(locale, "toast.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link
        href={`/works/${workId}/edit`}
        title={t(locale, "post.edit")}
        aria-label={t(locale, "post.edit")}
        className="inline-flex items-center transition-colors hover:text-blue"
      >
        {compact ? <SquarePen size={12} aria-hidden="true" /> : t(locale, "post.edit")}
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        title={t(locale, "post.delete")}
        aria-label={t(locale, "post.delete")}
        className="inline-flex items-center transition-colors hover:text-blue disabled:opacity-40"
      >
        {compact ? <Trash2 size={12} aria-hidden="true" /> : t(locale, "post.delete")}
      </button>
    </>
  );
}
