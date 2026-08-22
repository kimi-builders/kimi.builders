"use client";

/* Stats-bar count-up numbers: on entering the viewport, count to the
   final value over 0.9s ease-out — the cheapest possible proof that
   "the community is alive". SSR/initial render shows the final value
   directly (works without JS, no first-paint layout shift, real
   numbers for SEO); after hydration the animation starts on demand;
   prefers-reduced-motion or manual reduced motion (html data-motion)
   parks at the final value. */
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
