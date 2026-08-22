/* Lightweight toast: toast("...") from anywhere on the client; the
   outlet is <Toaster /> in the root layout. A pure event bus, zero
   dependencies; server calls (no window) are silently ignored.
   kind: error uses red semantics + a longer duration, graded from
   regular feedback; default info keeps the old behavior — existing
   call sites unchanged. */
export type ToastKind = "info" | "error";

export function toast(message: string, kind: ToastKind = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("kb:toast", { detail: { message, kind } }));
}
