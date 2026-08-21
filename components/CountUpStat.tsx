"use client";

/* 数据条滚动数字(20260815 评审):进入视口后 0.9s ease-out 数到终值,
   让「社区是活的」有最低成本的动效证明。
   SSR/初始渲染直接给终值(无 JS / 首屏无布局位移,SEO 也是真数字),
   水合后按需起播;prefers-reduced-motion 或手动减动效(html data-motion,
   20260821)直接停在终值。 */
import { useEffect, useRef, useState } from "react";
import { compactNumber } from "@/src/lib/format";
import type { Locale } from "@/src/lib/i18n";

export default function CountUpStat({
  value,
  locale,
  className,
}: {
  value: number;
  locale: Locale;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.documentElement.getAttribute("data-motion") === "reduce") return;
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started) return;
        started = true;
        io.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / 900);
          setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {compactNumber(display, locale)}
    </span>
  );
}
