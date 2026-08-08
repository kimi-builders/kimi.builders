"use client";

/* 全局 toast 出口:监听 toast() 派发的 kb:toast 事件,底部居中堆叠,2.6s 自灭。
   挂在根布局,跨客户端导航存活;最多同时留 3 条。 */
import { useEffect, useState } from "react";

interface Item {
  id: number;
  message: string;
}

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let seq = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const on = (e: Event) => {
      const message = String((e as CustomEvent).detail ?? "").trim();
      if (!message) return;
      const id = ++seq;
      setItems((cur) => [...cur.slice(-2), { id, message }]);
      const timer = setTimeout(() => {
        setItems((cur) => cur.filter((i) => i.id !== id));
        timers.delete(timer);
      }, 2600);
      timers.add(timer);
    };
    window.addEventListener("kb:toast", on);
    return () => {
      window.removeEventListener("kb:toast", on);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-max max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6"
    >
      {items.map((i) => (
        <p
          key={i.id}
          className="kb-toast border border-line bg-bg px-4 py-2 text-center font-mono text-xs text-paper shadow-lg"
        >
          {i.message}
        </p>
      ))}
    </div>
  );
}
