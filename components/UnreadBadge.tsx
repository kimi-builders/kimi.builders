"use client";

/* 通知未读角标(20260816):SSR 下发初值 hydration 不闪;之后每 45s
   (仅标签页可见)轮询 /api/notifications/unread,回到前台立即拉一次;
   数量变多 → toast 提示。布局常驻组件:SSR 初值变化时渲染期同步(不走 effect);
   轮询基线 lastSeen 只在校验/effect 里写(react-hooks/refs)。 */
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
  /* 两处置入样式不同(顶栏 text-bg / 抽屉 text-white),由调用方给全 */
  className: string;
}) {
  const [count, setCount] = useState(initial);
  const lastSeen = useRef(initial);
  /* layout 常驻:导航后 SSR 新初值到来时渲染期同步一次(如进了通知页清零) */
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCount(initial);
  }
  /* 轮询基线跟随 SSR 初值(effect 里写 ref,渲染期不碰) */
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
        /* 离线/抖动:下一轮再说 */
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
