/* Programmatic fields do not emit native input events. These explicit
   notifications bubble to the nearest modal body without depending on
   React's input-specific change event synthesis. */
export const MODAL_DIRTY_EVENT = "kb:modal-dirty";
export const MODAL_DIRTY_RESET_EVENT = "kb:modal-dirty-reset";

export function notifyModalDirty(source: EventTarget | null) {
  source?.dispatchEvent(new CustomEvent(MODAL_DIRTY_EVENT, { bubbles: true }));
}

export function notifyModalDirtyReset(source: EventTarget | null) {
  source?.dispatchEvent(
    new CustomEvent(MODAL_DIRTY_RESET_EVENT, { bubbles: true }),
  );
}
