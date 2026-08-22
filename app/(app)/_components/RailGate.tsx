"use client";

/* Right-rail consistency gate: the rail is dispatched by the layout
   per x-kb-path, but layouts don't re-render on soft navigation —
   RailRefresher's router.refresh() corrects it one beat later, and in
   that beat the rail still shows the previous page. This compares the
   current decision client-side against the one this rail rendered
   under: a mismatch hides it (visibility keeps the slot, no
   interaction) until the corrected rail arrives; pathname changes
   within the same context keep it visible. It eliminates the "main
   column is the new page, rail is the old one" mismatch window. Note:
   this wrapper carries the aside's column classes (self-stretch gives
   the inner sticky room to slide); the railgate hook lets the hidden
   rail exit the flex layout entirely (globals.css data-sidebar
   block). */
import { usePathname } from "next/navigation";
import { railDecisionKey, railFor } from "./right-rail";

export default function RailGate({
  decisionKey,
  children,
}: {
  decisionKey: string;
  children: React.ReactNode;
}) {
  const currentDecisionKey = railDecisionKey(railFor(usePathname()));
  const stale = currentDecisionKey !== decisionKey;
  return (
    <div
      aria-hidden={stale}
      className={`railgate hidden shrink-0 self-stretch transition-opacity duration-instant lg:ml-2 xl:block ${
        stale ? "pointer-events-none invisible opacity-0" : ""
      }`}
    >
      {children}
    </div>
  );
}
