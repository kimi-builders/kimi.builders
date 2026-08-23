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

/* Source-list memory: /works and /awesome share detail pages and forms;
   "back" uses this to return to the right list. Written by proxy on list
   pages, read server-side. */
export const WORKS_SRC_COOKIE = "kb-works-src";
export type WorksSource = "works" | "awesome";

export function readWorksSourceCookie(cookie: string): WorksSource | null {
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${WORKS_SRC_COOKIE}=(works|awesome)(?:;|$)`),
  );
  return match?.[1] === "works" || match?.[1] === "awesome" ? match[1] : null;
}
