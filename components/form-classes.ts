/* Shared form styles: the forms (post/work/article/settings) each
   inlined their own four inputCls variants, two label sizes
   (text-sm/text-xs), and three primary button specs — consolidated
   here into the single source (same move as seg-classes.ts). Aligned
   with the Kimi brand book: labels at the 12px label tier; the primary
   button is the page's single main action (44px, focus blue, same spec
   as list/detail CTAs); secondary buttons are mono 12px text buttons.
   Internal control functional sizes (input py-2.5, min-h-11) don't
   participate in the layout 4px ladder. */
export const INPUT_CLS =
  "min-h-11 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm leading-6 text-paper transition-colors placeholder:text-grey/50 focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/10";
export const LABEL_CLS = "mb-1.5 block text-xs leading-5 text-grey";
export const FORM_BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-blue bg-blue px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40";
export const FORM_BTN_GHOST =
  "inline-flex min-h-9 items-center rounded-lg px-3 font-mono text-xs text-grey transition-colors hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
