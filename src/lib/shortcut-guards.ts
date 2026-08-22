/* Shortcut trigger guards: pure functions, unit-tested. Rules:
   1. never fire with Cmd/Ctrl/Alt modifiers (browser-reserved combos
      untouched; Cmd+K belongs to the search's own listener);
   2. never fire in input state (focus in input/textarea/select/
      contenteditable or inside any dialog) — typing in the search box is
      never hijacked;
   3. never fire while a dialog is open (only Esc and the ? panel itself
      are exempt, see the caller);
   4. never fire during IME composition (isComposing).
   Shift is not blocked here: "?" is Shift+/ by nature; Shift filtering
   of letter keys is the caller's call. */
export interface ShortcutGuardEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}

export function isPlainShortcutContext(
  ev: ShortcutGuardEvent,
  target: Element | null,
  dialogOpen: boolean,
): boolean {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  if (ev.isComposing) return false;
  if (dialogOpen) return false;
  if (target?.closest("input, textarea, select, [contenteditable='true'], dialog")) {
    return false;
  }
  return true;
}

/* Whether the event target sits in an editable region (dialog-agnostic;
   the ? panel uses it for its input-state exemption). */
export function isEditableTarget(target: Element | null): boolean {
  return !!target?.closest("input, textarea, select, [contenteditable='true']");
}
