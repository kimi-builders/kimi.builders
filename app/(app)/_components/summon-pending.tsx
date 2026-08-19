"use client";

/* 召唤等待反馈(20260816):召唤成功后客户端轮询 /api/ai-reply/status,
   done → router.refresh() 一次拉出 AI 回复(免手动刷新);
   failed/skipped/超时 → toast 收尾。轮询仅标签页可见时进行。
   useSummonPending 管轮询,SummonPendingRow 渲染「正在输入」占位行。 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { BOT_AVATAR, BOT_NAME } from "@/src/lib/bot-identity";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";

export interface SummonTarget {
  commentId?: number;
  workCommentId?: number;
}

const POLL_MS = 4_000;
/* 兜底时长:Kimi API 正常几秒;超长未归就收起占位,引导去通知中心 */
const TIMEOUT_MS = 150_000;

export function useSummonPending({
  target,
  locale,
  onSettle,
}: {
  target: SummonTarget | null;
  locale: Locale;
  onSettle: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!target) return;
    const qs = target.commentId
      ? `commentId=${target.commentId}`
      : `workCommentId=${target.workCommentId}`;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + TIMEOUT_MS;

    const poll = async () => {
      if (stopped) return;
      if (Date.now() > deadline) {
        toast(t(locale, "post.aiReplySlow"));
        onSettle();
        return;
      }
      try {
        const res = await fetch(`/api/ai-reply/status?${qs}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { state?: string };
          if (data.state === "done") {
            toast(t(locale, "post.aiReplied"));
            onSettle();
            router.refresh();
            return;
          }
          if (data.state === "failed" || data.state === "skipped") {
            toast(t(locale, "post.aiReplyFailed"), "error");
            onSettle();
            return;
          }
        }
      } catch {
        /* 网络抖动:下一轮再说 */
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [target, locale, onSettle, router]);
}

/* 「小筑正在输入…」占位行:与评论行同构(bot 头像 + 名字 + AI 徽章) */
export function SummonPendingRow({ locale }: { locale: Locale }) {
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 py-4 font-mono text-xs text-grey"
    >
      <Avatar url={BOT_AVATAR} handle={BOT_NAME} size={20} className="h-5 w-5" />
      <span className="text-paper">{BOT_NAME}</span>
      <span className="rounded-md border border-blue px-1.5 py-px text-xs tracking-wider text-blue">
        AI
      </span>
      <span className="animate-pulse">{t(locale, "post.aiTyping")}</span>
    </div>
  );
}
