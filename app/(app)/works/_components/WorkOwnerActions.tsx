"use client";

/* 作品卡片的作者动作:编辑(跳 /works/[id]/edit)+ 删除(confirm → toast → refresh)。
   仅本人卡片渲染(服务端判断后挂载)。 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { deleteWorkAction } from "../actions";

export default function WorkOwnerActions({
  workId,
  locale,
  redirectTo,
}: {
  workId: number;
  locale: Locale;
  /* 详情页删除后要跳走(refresh 会停在「已撤下」页);卡片场景缺省 refresh */
  redirectTo?: string;
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
        toast(t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.deleted"));
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link
        href={`/works/${workId}/edit`}
        className="transition-colors hover:text-blue"
      >
        {t(locale, "post.edit")}
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="transition-colors hover:text-blue disabled:opacity-40"
      >
        {t(locale, "post.delete")}
      </button>
    </>
  );
}
