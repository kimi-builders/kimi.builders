"use client";

/* De-coding binary backdrop for the home poster hero: a deterministic
   0/1 character grid (mulberry32, fixed seed) in the technical typeface,
   tinted toward the brand blue via color-mix on existing tokens, with a
   bottom fade into the poster ground. Purely presentational: no state,
   no network, no layout impact (absolute, z -1 inside the isolated
   poster section), renders nothing on the server and fills on mount so
   SSR HTML and hydration stay identical. Density follows the box with a
   hard cell cap; the character stream itself is static (no animation),
   so reduced-motion needs no branch here. */
import { useEffect, useRef } from "react";

/* Same LCG family as the kimi-brand guide-page hero; any fixed seed is
   fine as long as it never changes between renders. */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260914;
const MAX_CELLS = 36000;

export default function DecodingBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fill = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // ~7.2px advance per "0 " pair at 12px mono; cap keeps huge
      // viewports from building an unbounded string.
      const cols = Math.ceil(rect.width / 7.2);
      const rows = Math.ceil(rect.height / 18);
      const n = Math.min(Math.ceil(cols * rows * 1.15), MAX_CELLS);
      const rand = mulberry32(SEED);
      const parts = new Array<string>(n);
      for (let i = 0; i < n; i++) parts[i] = rand() < 0.5 ? "0" : "1";
      el.textContent = parts.join(" ");
    };
    fill();
    const ro = new ResizeObserver(() => requestAnimationFrame(fill));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={ref} aria-hidden="true" className="decode-backdrop" />;
}
