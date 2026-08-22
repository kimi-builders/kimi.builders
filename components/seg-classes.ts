/* Shared segmented-control styles: a uniform 44px outer height across
   viewports. kb-control-group also isolates globals.css's generic nav
   link min-height so the container isn't double-stretched. Selected
   grammar (unified with the usage-cli dashboard): an inverted solid
   block (paper fill + bg text), no longer outline + brightened text —
   the selected state must read at a glance. */
export const SEG_WRAP =
  "kb-control-group inline-flex h-11 items-center gap-0.5 rounded-lg border border-line bg-card p-[3px]";
export const SEG_ITEM =
  "inline-flex h-full min-h-0 items-center rounded-md border border-transparent px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
export const SEG_ITEM_ACTIVE = "border-paper bg-paper text-bg font-medium";
export const SEG_ITEM_IDLE = "text-grey hover:text-paper";

/* Wrappable variant (the community category filter): with many/long
   options (e.g. EN Showcase/Feedback) the group wraps; row height
   36px (h-9) + p-[3px] keeps the single-row rhythm. Once wrapped,
   each item flex-grows to fill its row evenly (a single-row container
   shrink-wraps, so grow is inert) — no orphan half-row for the last
   option; centered text matches the fill. */
export const SEG_WRAP_FLOW =
  "kb-control-group inline-flex min-h-11 flex-wrap items-center gap-0.5 rounded-lg border border-line bg-card p-[3px]";
export const SEG_ITEM_FLOW =
  "inline-flex h-9 min-h-0 grow items-center justify-center rounded-md border border-transparent px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
