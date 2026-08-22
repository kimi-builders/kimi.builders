"use client";

/* Notification unread badge: the SSR initial value avoids a hydration
   flash; afterwards it polls /api/notifications/unread every 45s
   (visible tabs only) and pulls immediately on returning to the
   foreground; an increase -> a toast. A layout-resident component:
   changed SSR initial values sync during render (never in an effect);
   the polling baseline lastSeen is written only in
   validation/effects (react-hooks/refs). */
import { useEffect, useRef, useState } from "react";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";

const POLL_MS = 45_000;

export default function UnreadBadge({
  initial,
  locale,
  className,
}: {
  initial: number;
  locale: Locale;
  /* The two mount points style it differently (top bar text-bg /
     drawer text-white) — callers supply it. */
  className: string;
}) {
  const [count, setCount] = useState(initial);
  const lastSeen = useRef(initial);
  /* Layout-resident: when navigation brings a new SSR initial value,
     sync once during render (e.g. zeroed by the notifications page). */
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCount(initial);
  }
  /* The polling baseline follows the SSR initial value (ref written in
     an effect, never touched during render). */
  useEffect(() => {
    lastSeen.current = initial;
  }, [initial]);

  useEffect(() => {
    const pull = async () => {
      try {
        const res = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        const next = Number(data.count ?? 0);
        if (next > lastSeen.current) toast(t(locale, "notif.newToast"));
        lastSeen.current = next;
        setCount(next);
      } catch {
        /* Offline/jitter: the next round decides. */
      }
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [locale]);

  if (count <= 0) return null;
  return <span className={className}>{count > 99 ? "99+" : count}</span>;
}
