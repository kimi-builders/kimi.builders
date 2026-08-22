/* Brand token palette — the single source of inline colors for OG images
   / share posters (Satori JSX -> image). Source: the kimi-brand design
   system tokens/kimi-tokens.css|json (2026-08-18 snapshot, official
   brand page https://www.kimi.ai/zh-hans/resources/kimi-brand).
   Confidence markers follow the source convention: [official] = given
   directly by the brand palette; [suggested] = our mapping of an
   official color to a purpose. Satori has no CSS variables — poster
   components take colors from here and nowhere else. */

/** Official brand colors as-is (the 15 brand colors + the digital UI
    blue). */
export const BRAND = {
  blueDeep: "#002F5B", // deep blue: depth layers, dark emphasis [official]
  blue: "#007CFF", // focus blue: the only high-saturation focus
                     // (PANTONE 2387C) [official]
  blueBright: "#00A1FF", // bright blue: sibling differentiation,
                           // secondary blue [official]
  blueSoft: "#A0DAF7", // soft blue: large-area ambience, background
                        // steps [official]
  cyan: "#00F6FF", // cyan: digital texture, De-coding accents [official]
  signalBlue: "#1783FF", // digital signal blue / logo dot [official]
  uiBlue: "#1A88FF", // UI blue (dark-mode interaction) [official]
  mint: "#B3F4A8", // mint pastel: positive status [official]
  pink: "#FFD1D4", // pink pastel: negative status [official]
  lemon: "#F4F9A7", // lemon pastel: warning accents [official]
  ink: "#121212", // primary text / dark background [official]
  grey1: "#707070", // secondary text [official]
  grey2: "#8D9390", // neutral transitions, de-emphasis [official]
  grey3: "#C3C3C3", // comparison subjects, out-of-focus series [official]
  grey4: "#E1E3E6", // grid lines, separators, borders (light bg) [official]
  paper: "#FFFFFF", // light background / primary text on dark [official]
} as const;

/** Dark poster semantic palette: official colors -> poster roles
    [suggested mapping]. The dark neutral steps (#181818 / #1A1A1A /
    #343434) come from the official dark token semantics
    (--kimi-dark-grid-line) and the site's --color-viz-surface in
    globals.css — not invented colors. */
export const POSTER_PALETTE = {
  background: BRAND.ink, // poster base (replaces invented #050607)
  surface: "#181818", // viz-surface: bar tracks / empty heat cells /
                       // icon wells
  paper: BRAND.paper, // primary text on dark (replaces #f4f6f8)
  muted: BRAND.grey2, // secondary text / labels / ticks (the official
                       // counterpart of #8a9099)
  line: "#343434", // separators / strokes (official dark grid line
                    // [suggested])
  grid: "#1A1A1A", // chart grid lines / empty-cell strokes / dashed
                    // lines (dark panel step)
  blue: BRAND.blue, // focus blue: primary data series / key numbers
                     // (replaces #1478ff)
  blueBright: BRAND.blueBright, // bright blue: secondary accents /
                                 // bar-top highlights / links (replaces
                                 // #54a3ff)
  green: BRAND.mint, // positive status: cost / cache / first place
                      // (replaces invented #20d39a)
  greenInk: BRAND.ink, // text on pastel fills (replaces #03291f)
  amber: BRAND.lemon, // warning / reasoning (replaces invented #f6a609)
  seriesNeutral: "#3A3A3A", // dark out-of-focus series (official dark
                             // series neutral [suggested])
} as const;

/** Alpha derivatives of official colors (Satori has no color-mix,
    spelled out; base colors are all BRAND originals). */
export const POSTER_ALPHA = {
  focusGlow10: "rgba(0,124,255,0.10)", // radial glow, top-right of the
                                         // poster base
  focusBorder25: "rgba(0,124,255,0.25)", // heat data-cell stroke
  paper72: "rgba(255,255,255,0.72)", // stacked bar — output segment
  paper50: "rgba(255,255,255,0.5)", // 7-day average dashed line
  ink40: "rgba(18,18,18,0.4)", // dot pattern on mint fills
  ink0: "rgba(18,18,18,0)", // gradient fade-out end
} as const;

/** Heat 5 levels: level 0 (no data) uses the neutral surface (near-
    invisible on the base), 1-4 step up the official blue ramp (same
    ramp as the site's dark --color-viz-sequential-2..5). */
export const POSTER_HEAT_SCALE: string[] = [
  POSTER_PALETTE.surface,
  BRAND.blue,
  BRAND.blueBright,
  BRAND.blueSoft,
  BRAND.cyan,
];

/** Hourly heatmap 6 steps: focus-blue alpha fading toward a solid end
    (thresholds in UsageSharePoster.heatStep). */
export const POSTER_HEAT_STEPS: string[] = [
  "rgba(0,124,255,0.15)",
  "rgba(0,124,255,0.30)",
  "rgba(0,124,255,0.45)",
  "rgba(0,124,255,0.60)",
  "rgba(0,124,255,0.80)",
  BRAND.blue,
];
