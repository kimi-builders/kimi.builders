/* Curated official-artwork cover gallery: the brand's De-coding
   wallpaper set, compressed to 1600px webp under public/covers. Covers
   are content images — they never re-skin with identity or theme.
   Articles store the src as payload.cover (a root-relative path);
   works store it in cover_key (mediaUrl passes root-relative keys
   through). Awesome-sourced rows never carry a stored cover, so they
   get a deterministic pick keyed on the entry name — same entry, same
   artwork, forever. */

export interface GalleryCover {
  id: string;
  /* Root-relative public path (public/covers). */
  src: string;
  zh: string;
  en: string;
}

export const COVER_GALLERY: readonly GalleryCover[] = [
  { id: "paper-plane", src: "/covers/paper-plane.webp", zh: "点阵纸飞机", en: "Paper plane" },
  { id: "world-map-deep", src: "/covers/world-map-deep.webp", zh: "深色世界地图", en: "World map (deep)" },
  { id: "wave-dark-cyan", src: "/covers/wave-dark-cyan.webp", zh: "暗青波纹", en: "Dark cyan wave" },
  { id: "kimi-letters", src: "/covers/kimi-letters.webp", zh: "KiMi 字母阵", en: "KiMi letters" },
  { id: "terrain-blue", src: "/covers/terrain-blue.webp", zh: "蓝色地形", en: "Blue terrain" },
  { id: "moon-dark-near", src: "/covers/moon-dark-near.webp", zh: "月轮 · 暗面近处", en: "Moon (dark, near)" },
  { id: "moon-dark-far", src: "/covers/moon-dark-far.webp", zh: "月轮 · 暗面远处", en: "Moon (dark, far)" },
  { id: "world-map-orange", src: "/covers/world-map-orange.webp", zh: "橙色世界地图", en: "World map (orange)" },
] as const;

/* Write-path allowlist: form submissions may only carry gallery srcs
   as preset covers (arbitrary paths would turn the cover field into a
   same-origin redirect vector). */
export function isGalleryCoverSrc(src: string): boolean {
  return COVER_GALLERY.some((cover) => cover.src === src);
}

/* djb2 over the UTF-16 code units — stable across runtimes and good
   enough for an even spread over eight entries. */
function hashName(name: string): number {
  let hash = 5381;
  for (let index = 0; index < name.length; index += 1) {
    hash = ((hash << 5) + hash + name.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function awesomeCover(name: string): GalleryCover {
  return COVER_GALLERY[hashName(name) % COVER_GALLERY.length];
}
