/* getWorksView: server-side read of the view-preference cookie (server
   components / server actions only; next/headers must never enter the
   client bundle — constants live in the client-safe works-view.ts). */
import { cookies, headers } from "next/headers";
import {
  WORKS_SRC_COOKIE,
  WORKS_VIEW_COOKIE,
  isMobileUA,
  type WorksSource,
  type WorksView,
} from "./works-view";

/* Mobile request detection: shared by the three pages (works/awesome/
   explore) — mobile never renders the view toggle and the list stays
   rows; same source as getWorksView, both calls read one cached header
   set per request (next/headers). */
export async function isMobileRequest(): Promise<boolean> {
  const h = await headers();
  return isMobileUA(h.get("user-agent") ?? "");
}

export async function getWorksView(): Promise<WorksView> {
  /* Mobile is always rows: the cover wall is single-column big cards on
     phones; a grid cookie preference does not apply. */
  if (await isMobileRequest()) return "list";
  const store = await cookies();
  return store.get(WORKS_VIEW_COOKIE)?.value === "grid" ? "grid" : "list";
}

/* Source list (proxy writes it on the /works and /awesome list pages):
   null = no memory (opened a detail page directly); callers fall back to
   work.source. */
export async function getWorksSource(): Promise<WorksSource | null> {
  const store = await cookies();
  const value = store.get(WORKS_SRC_COOKIE)?.value;
  return value === "awesome" || value === "works" ? value : null;
}
