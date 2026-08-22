/* UI preferences (cookie-driven, SSR renders the target state directly:
   no flicker, switchable without JS). kb_nav=1 -> left rail collapses
   to icons; kb_sidebar=0 -> right rail hidden (re-openable from the
   left rail's "interface" group); kb_theme=light -> light theme (dark
   by default); kb_vibe=soft -> rounded classic vibe (the default is
   configurable via DEFAULT_VIBE in src/lib/vibe.ts, no longer a
   literal here); kb_motion=reduce -> manually reduced motion (default
   unset = follow prefers-reduced-motion; the toggle lives in settings
   "preferences"). Toggle actions live in
   app/(app)/community/actions.ts and settings/actions.ts. */
import { cookies } from "next/headers";
import { normalizeVibe, type Vibe } from "./vibe";

export type Theme = "dark" | "light";
export type Motion = "follow" | "reduce";
export type { Vibe };

export interface UiPrefs {
  navCollapsed: boolean;
  sidebarHidden: boolean;
  theme: Theme;
  vibe: Vibe;
  motion: Motion;
}

export async function getUiPrefs(): Promise<UiPrefs> {
  const store = await cookies();
  return {
    navCollapsed: store.get("kb_nav")?.value === "1",
    sidebarHidden: store.get("kb_sidebar")?.value === "0",
    theme: store.get("kb_theme")?.value === "light" ? "light" : "dark",
    vibe: normalizeVibe(store.get("kb_vibe")?.value),
    motion: store.get("kb_motion")?.value === "reduce" ? "reduce" : "follow",
  };
}
