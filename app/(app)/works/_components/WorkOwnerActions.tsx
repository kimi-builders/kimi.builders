"use client";

/* 作品卡片的作者动作:编辑(跳 /works/[id]/edit)+ 删除(confirm → toast → refresh)。
   仅本人卡片渲染(服务端判断后挂载)。compact=网格卡紧凑态:只留图标
   (title/aria-label 提示),避免与支持/访问/源码挤在一行(20260918)。 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, SquarePen, Trash2 } from "lucide-react";
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
    <details
      data-compact={compact ? "true" : "false"}
      className="group/owner relative"
    >
      <summary
        aria-label={locale === "zh" ? "更多操作" : "More actions"}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </summary>
      {/* 弹层底色用不透明抬升面 bg-moon(与 FilterDropdown 同源;bg-card 是
          5% 薄涂会透出下层文字,20260819 修);菜单项 hover 反用 bg-card 浅阶 */}
      <div className="absolute right-0 top-10 z-30 w-36 rounded-xl border border-line bg-moon p-1.5 shadow-xl">
      <Link
        href={`/works/${workId}/edit`}
        aria-label={t(locale, "post.edit")}
        className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-paper transition-colors hover:bg-card hover:text-ui-blue"
      >
        <SquarePen size={14} aria-hidden="true" />
        <span>{t(locale, "post.edit")}</span>
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={t(locale, "post.delete")}
        className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-grey transition-colors hover:bg-card hover:text-status-danger-fg disabled:opacity-40"
      >
        <Trash2 size={14} aria-hidden="true" />
        <span>{t(locale, "post.delete")}</span>
      </button>
      </div>
    </details>
  );
}
