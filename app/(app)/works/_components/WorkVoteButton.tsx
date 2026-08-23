"use client";

/* The work "support" button: up-only, click again to cancel. Optimistic
   — the click flips fill/count immediately, the write lands in the
   background, and failures (rate limit/signed out) roll back + toast
   (same pattern as the community VoteCluster). Not rendered when
   signed out (the detail page shows a read-only count). */
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
      /* Server rejection (rate limit etc.): roll back the optimistic
         state; the rate-limit copy carries the wait seconds. */
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
    /* The parent gives try/support equal grid tracks; this control fills
       its track at the same fixed 44px height as the primary CTA. */
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg border px-2 font-mono text-xs whitespace-nowrap transition-colors sm:gap-1.5 sm:px-3 sm:text-sm ${
        state.voted
          ? "border-blue text-blue"
          : "border-line text-grey hover:border-ui-blue hover:text-ui-blue"
      }`}
    >
      <Heart size={13} fill={state.voted ? "currentColor" : "none"} />
      {label} · {state.count}
    </button>
  );
}
