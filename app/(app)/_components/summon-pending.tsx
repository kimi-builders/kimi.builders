"use client";

/* Summon wait feedback: after a successful summon the client polls
   /api/ai-reply/status; done -> one router.refresh() pulls in the AI
   reply (no manual refresh); failed/skipped/timeout -> a closing
   toast. Polling runs only while the tab is visible. useSummonPending
   owns the polling; SummonPendingRow renders the "typing" placeholder
   row. */
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
/* Backstop duration: the Kimi API normally answers in seconds; past
   this the placeholder folds and the user is pointed at the
   notification center. */
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
        /* Network jitter: let the next round decide. */
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

/* The "bot is typing..." placeholder row: same structure as a comment
   row (bot avatar + name + AI badge). */
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
