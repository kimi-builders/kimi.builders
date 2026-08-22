/* Site default vibe (configurable): two visual vibes — poster =
   angular engineering / soft = rounded classic (globals.css data-vibe
   blocks carry the shape language). DEFAULT_VIBE is the single source
   used in three places: the fallback without a kb_vibe cookie, the
   settings page's "default" badge, and the toggle/reset actions' value
   — change it here to switch the site default. Client-safe (pure
   constants + pure functions, unit-tested); cookie reads live in
   prefs.ts (next/headers, server-only). */
export type Vibe = "poster" | "soft";

export const DEFAULT_VIBE: Vibe = "soft";

/* Cookie/form normalization: the two valid vibes pass through; anything
   else (missing/dirty) falls back to the site default. */
export function normalizeVibe(value: string | null | undefined): Vibe {
  return value === "poster" || value === "soft" ? value : DEFAULT_VIBE;
}
