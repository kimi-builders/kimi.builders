"use client";

/* 作品的编辑精选操作(仅 admin/mod 渲染,服务端判断;action 里再兜底)。
   挂在 WorkCard 底部:未精选 → 「设为精选」展开理由小表单;
   已精选 → 显示当前理由 + 取消按钮。成功后 toast + router.refresh()。 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { featureWorkAction, unfeatureWorkAction } from "../actions";

export default function WorkFeaturedToggle({
  workId,
  featuredReason,
  locale,
}: {
  workId: number;
  featuredReason: string | null;
  locale: Locale;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("work_id", String(workId));
      fd.set("reason", reason);
      const res = await featureWorkAction(fd);
      if (!res.ok) {
        toast(res.error ?? t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.featured"));
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setBusy(false);
    }
  };

  const unset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("work_id", String(workId));
      const res = await unfeatureWorkAction(fd);
      if (!res.ok) {
        toast(t(locale, "toast.failed"));
        return;
      }
      toast(t(locale, "toast.unfeatured"));
      router.refresh();
    } catch {
      toast(t(locale, "toast.failed"));
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "inline-flex items-center font-mono text-[11px] text-grey transition-colors hover:text-blue disabled:opacity-40";

  return (
    <div className="pt-3 font-mono text-[11px]">
      {featuredReason !== null ? (
        <span className="inline-flex min-w-0 items-center gap-3">
          <span className="max-w-56 truncate text-blue" title={featuredReason}>
            {t(locale, "featured.badge")} · {featuredReason}
          </span>
          <button
            type="button"
            onClick={unset}
            disabled={busy}
            className={btn}
          >
            {busy ? t(locale, "post.submitting") : t(locale, "featured.unset")}
          </button>
        </span>
      ) : open ? (
        <span className="flex items-center gap-2">
          <input
            type="text"
            value={reason}
            maxLength={280}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={t(locale, "featured.reasonPh")}
            autoFocus
            className="min-w-0 flex-1 border border-line bg-transparent px-2 py-1 text-xs text-paper placeholder:text-grey focus:border-blue focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !reason.trim()}
            className={btn}
          >
            {busy ? t(locale, "post.submitting") : t(locale, "post.save")}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
            className={btn}
          >
            {t(locale, "post.cancel")}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy}
          className={btn}
        >
          {t(locale, "featured.set")}
        </button>
      )}
    </div>
  );
}
