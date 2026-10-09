/* Work-list view preference: the list (rows, default) / grid (cover wall)
   toggle shared by /works and /awesome. Stored in a cookie, not
   localStorage — the lists are server-rendered, and a cookie lets the
   server emit the right card directly: no flicker, no hydration jump;
   WorksViewToggle (client) writes it and router.refresh() re-renders.
   This file is client-safe (constants only): getWorksView (next/headers)
   lives in works-view-server.ts, so client imports of this file never
   pull server APIs into the browser bundle. /u/[handle] does not toggle
   (always rows). */
export type WorksView = "list" | "grid";
export const WORKS_VIEW_COOKIE = "kb-works-view";

/* Mobile UA detection (pure, unit-tested): mobile is always rows — the
   cover wall degrades to single-column big cards under 640px, so the
   toggle adds nothing; the cookie preference does not apply on mobile
   (prevents "desktop picked grid, phone trapped in one column with no way
   back"). iPads are exempt: iPadOS 13+ requests desktop UAs and the
   viewport is wide enough — desktop rules apply. UA detection is
   imperfect, but the stakes are only the list shape. */
export function isMobileUA(ua: string): boolean {
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/* Explicit link context wins over visit memory; prefetches must never
   change the user's active source list. */
export const WORKS_SRC_COOKIE = "kb-works-src";
export type WorksSource = "works" | "awesome";

export function parseWorksSource(value: unknown): WorksSource | null {
  return value === "works" || value === "awesome" ? value : null;
}

export function workDetailHref(id: number, source?: WorksSource): string {
  return `/works/${id}${source ? `?from=${source}` : ""}`;
}

export function readWorksSourceCookie(cookie: string): WorksSource | null {
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${WORKS_SRC_COOKIE}=(works|awesome)(?:;|$)`),
  );
  return match?.[1] === "works" || match?.[1] === "awesome" ? match[1] : null;
}
