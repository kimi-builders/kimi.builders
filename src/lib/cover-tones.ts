/* Name-brick tone registry (flat cards: follow-theme / green / blue /
   black; dual-theme aware; colors come from the Kimi brand system, no
   invented hues): the list cover for works without an uploaded one.
   Every value comes from the brand book — blue = the official deep/light
   pair (#002F5B / #A0DAF7), green is mint (the official status green
   #B3F4A8 + ink text, same rendering in both themes), black = the
   official CLI pure black #000 / ink #121212. Ids never change
   (theme/green/blue/black), so existing works.cover_tone needs zero
   migration — the palette is what you get. theme follows the active
   theme (globals.css .work-cover-tile); fixed tones shift with the theme
   via the .work-tone-* classes (driven by data-theme; JS only emits the
   class name — the hex values here are documentation, CSS is the
   truth). Adding/removing a tone: change this file plus the matching
   class in globals.css; the form palette and the works.cover_tone
   allowlist read this registry. Legacy tone ids were mapped to
   green/blue/black by a migration. */
export const COVER_TONES = [
  { id: "theme", dark: null, light: null, zh: "跟随主题", en: "Theme" },
  { id: "green", dark: "#B3F4A8", light: "#B3F4A8", zh: "薄荷卡", en: "Mint" },
  { id: "blue", dark: "#002F5B", light: "#A0DAF7", zh: "蓝卡", en: "Blue" },
  { id: "black", dark: "#000000", light: "#121212", zh: "黑卡", en: "Black" },
] as const;

export type CoverToneId = (typeof COVER_TONES)[number]["id"];

export function isCoverTone(id: string): id is CoverToneId {
  return COVER_TONES.some((tone) => tone.id === id);
}

/* theme returns null (the .work-cover-tile theme style applies); fixed
   tones return the globals.css tone class (.work-tone base +
   .work-tone-{id}, light-theme overrides included). */
export function coverToneClass(id: string): string | null {
  return isCoverTone(id) && id !== "theme" ? `work-tone work-tone-${id}` : null;
}

export function coverToneName(id: string, zh: boolean): string {
  const tone = COVER_TONES.find((item) => item.id === id) ?? COVER_TONES[0];
  return zh ? tone.zh : tone.en;
}

/* Name-brick texture variants: with few tones (three fixed + theme),
   rising density means same-color bricks repeat and the rhythm goes
   monotone; a stable hash over the brick's label (the product name)
   gives roughly half the bricks a fine grid texture (.work-tile-grid —
   tone and theming live in CSS); same-name bricks keep the same texture
   (name bricks are generated from names anyway). Pure function,
   unit-tested directly. */
export function coverTextureClass(key: string): "work-tile-grid" | null {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? "work-tile-grid" : null;
}
