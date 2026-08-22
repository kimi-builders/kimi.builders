"use client";

/* Refresh the server tree on soft navigation across rail contexts: the
   layout holds the pathname-dispatched rail (railFor), but App Router
   layouts don't re-render on client navigation (and under cached
   components/Activity semantics template.tsx can't reliably do it
   either — round-trip navigation was measured to scramble state). The
   same decision (kind + detail id + wide) needs no refetch; a changed
   decision refreshes to correct the rail and column width. */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { railDecisionKey, railFor } from "./right-rail";

export default function RailRefresher() {
  const decisionKey = railDecisionKey(railFor(usePathname()));
  const router = useRouter();
  const previous = useRef(decisionKey);

  useEffect(() => {
    if (previous.current === decisionKey) return;
    previous.current = decisionKey;
    router.refresh();
  }, [decisionKey, router]);

  return null;
}
