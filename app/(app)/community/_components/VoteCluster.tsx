"use client";

/* 顶/踩投票簇:乐观更新 —— 点击立即改填充/计数,后台落库,失败回滚 + toast。
   两个箭头之间拉开间距(gap-2.5),各带 hover 文案提示(title);帖子/评论通用。
   未登录不渲染本组件(调用方渲染只读分数)。 */
import { useRef, useState } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { setCommentReactionAction, setPostReactionAction } from "../actions";

export default function VoteCluster({
  target,
  id,
  score: initialScore,
  up: initialUp,
  down: initialDown,
  locale,
  size = 14,
}: {
  target: "post" | "comment";
  id: number;
  score: number;
  up: boolean;
  down: boolean;
  locale: Locale;
  size?: number;
}) {
  const [state, setState] = useState({
    up: initialUp,
    down: initialDown,
    score: initialScore,
  });
  const busy = useRef(false);

  const vote = async (kind: "up" | "down") => {
    if (busy.current) return;
    busy.current = true;
    const prev = state;
    /* 同向再点 = 取消;反向 = 换边(与服务端 setReaction 语义一致) */
    let { up, down, score } = state;
    if (kind === "up") {
      if (up) {
        up = false;
        score -= 1;
      } else {
        score += down ? 2 : 1;
        up = true;
        down = false;
      }
    } else {
      if (down) {
        down = false;
        score += 1;
      } else {
        score -= up ? 2 : 1;
        down = true;
        up = false;
      }
    }
    setState({ up, down, score });
    try {
      const fd = new FormData();
      fd.set(target === "post" ? "post_id" : "comment_id", String(id));
      fd.set("kind", kind);
      const res = await (target === "post"
        ? setPostReactionAction(fd)
        : setCommentReactionAction(fd));
      /* 服务端拒绝(限流/未登录等):回滚乐观态,限流文案带等待秒数 */
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

  const upLabel = t(locale, state.up ? "post.unup" : "post.up");
  const downLabel = t(locale, state.down ? "post.undown" : "post.down");
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => vote("up")}
        aria-label={upLabel}
        title={upLabel}
        className={`inline-flex items-center rounded-lg px-2 py-1.5 transition-all active:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
          state.up ? "text-ui-blue" : "text-grey hover:bg-paper/[0.05] hover:text-ui-blue"
        }`}
      >
        <ArrowBigUp size={size} fill={state.up ? "currentColor" : "none"} />
      </button>
      <span
        className={`min-w-4 text-center font-mono text-xs font-semibold ${
          state.up ? "text-ui-blue" : state.down ? "text-paper" : "text-grey"
        }`}
      >
        {state.score}
      </span>
      <button
        type="button"
        onClick={() => vote("down")}
        aria-label={downLabel}
        title={downLabel}
        className={`inline-flex items-center rounded-lg px-2 py-1.5 transition-all active:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
          state.down ? "text-paper" : "text-grey hover:bg-paper/[0.05] hover:text-paper"
        }`}
      >
        <ArrowBigDown size={size} fill={state.down ? "currentColor" : "none"} />
      </button>
    </span>
  );
}
