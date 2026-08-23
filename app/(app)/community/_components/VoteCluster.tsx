"use client";

/* Up/down vote cluster: optimistic — the click flips fill/count
   immediately, the write lands in the background, failures roll back +
   toast. Thumbs (not arrows): the up/down-thumb metaphor reads as
   like/dislike without learning anything, filled when active. Shared by
   posts and comments. Not rendered when signed out (callers show a
   read-only score). */
import { useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
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
    /* Same direction again = cancel; opposite = switch (matching the
       server's setReaction semantics). */
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
      /* Server rejection (rate limit/signed out etc.): roll back the
         optimistic state; the rate-limit copy carries the wait seconds. */
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
        data-tip={upLabel}
        className={`inline-flex items-center rounded-lg px-2 py-1.5 transition-[color,background-color,transform] active:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
          state.up ? "text-ui-blue" : "text-grey hover:bg-paper/[0.05] hover:text-ui-blue"
        }`}
      >
        <ThumbsUp size={size} fill={state.up ? "currentColor" : "none"} />
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
        data-tip={downLabel}
        className={`inline-flex items-center rounded-lg px-2 py-1.5 transition-[color,background-color,transform] active:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
          state.down ? "text-paper" : "text-grey hover:bg-paper/[0.05] hover:text-paper"
        }`}
      >
        <ThumbsDown size={size} fill={state.down ? "currentColor" : "none"} />
      </button>
    </span>
  );
}
