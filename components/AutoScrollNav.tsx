"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";

/* After URL state changes, the horizontal scroller centers the active
   item so it never sits clipped at an edge. */
export default function AutoScrollNav({
  activeKey,
  ariaLabel,
  className,
  children,
}: {
  activeKey: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const navRef = useRef<HTMLElement>(null);
  const hydrated = useRef(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[data-scroll-active="true"]');
    if (!nav || !active) return;

    const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    const left = Math.min(nav.scrollWidth - nav.clientWidth, Math.max(0, target));
    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";

    nav.scrollTo({
      left,
      behavior: hydrated.current && !reducedMotion ? "smooth" : "auto",
    });
    hydrated.current = true;
  }, [activeKey]);

  return (
    <nav ref={navRef} aria-label={ariaLabel} className={className}>
      {children}
    </nav>
  );
}
