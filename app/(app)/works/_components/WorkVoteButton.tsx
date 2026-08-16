"use client";

/* 作品「支持」按钮(P1-2):顶只有,再点取消。乐观更新 —— 点击立即翻转填充/计数,
   后台落库,失败(限流/未登录等)回滚 + toast(模式同社区 VoteCluster)。
   未登录不渲染本组件(详情页渲染只读计数)。 */
import { useRef, useState } from "react";
import { Heart } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { toggleWorkVoteAction } from "../actions";

export default function WorkVoteButton({
  workId,
  voted: initialVoted,
  count: initialCount,
  locale,
}: {
  workId: number;
  voted: boolean;
  count: number;
  locale: Locale;
}) {
  const [state, setState] = useState({ voted: initialVoted, count: initialCount });
  const busy = useRef(false);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const prev = state;
    setState({
      voted: !state.voted,
      count: state.count + (state.voted ? -1 : 1),
    });
    try {
      const fd = new FormData();
      fd.set("work_id", String(workId));
      const res = await toggleWorkVoteAction(fd);
      /* 服务端拒绝(限流等):回滚乐观态,限流文案带等待秒数 */
      if (!res.ok) {
        setState(prev);
        toast(res.error || t(locale, "toast.failed"), "error");
      }
    } catch {
      setState(prev);
      toast(t(locale, "toast.failed"), "error");
    } finally {
      busy.current = false;
    }
  };

  const label = t(locale, state.voted ? "works.supported" : "works.support");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1.5 border px-4 py-1.5 font-mono text-xs transition-colors ${
        state.voted
          ? "border-blue text-blue"
          : "border-line text-grey hover:border-blue hover:text-blue"
      }`}
    >
      <Heart size={13} fill={state.voted ? "currentColor" : "none"} />
      {label} · {state.count}
    </button>
  );
}
