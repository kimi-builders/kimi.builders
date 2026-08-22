"use client";

/* Explore page-level arrow keys:
   - ChapterKeys (list page): <- -> cycle through "all + chapters with
     content"; target hrefs are computed server-side via lensHref —
     lenses (products/tags etc.) survive the chapter switch;
   - ArticleKeys (detail page): <- previous (older) / -> next (newer),
     the same direction semantics as the letter footer's issue
     navigation; no wrap-around at the ends.
   Guards reuse the global layer's pure functions (modifiers/input
   state/dialog state/IME). */
import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isPlainShortcutContext } from "@/src/lib/shortcut-guards";

function useArrowKeys(onLeft: () => void, onRight: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (
        !isPlainShortcutContext(
          event,
          event.target as Element | null,
          document.querySelector("dialog[open]") !== null,
        )
      ) {
        return;
      }
      event.preventDefault();
      if (event.key === "ArrowLeft") onLeft();
      else onRight();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLeft, onRight]);
}

export function ChapterKeys({ hrefs, index }: { hrefs: string[]; index: number }) {
  const router = useRouter();
  const onLeft = useCallback(() => {
    if (hrefs.length < 2) return;
    router.push(hrefs[(index - 1 + hrefs.length) % hrefs.length], { scroll: false });
  }, [router, hrefs, index]);
  const onRight = useCallback(() => {
    if (hrefs.length < 2) return;
    router.push(hrefs[(index + 1) % hrefs.length], { scroll: false });
  }, [router, hrefs, index]);
  useArrowKeys(onLeft, onRight);
  return null;
}

export function ArticleKeys({ prev, next }: { prev?: string; next?: string }) {
  const router = useRouter();
  const onLeft = useCallback(() => {
    if (prev) router.push(prev);
  }, [router, prev]);
  const onRight = useCallback(() => {
    if (next) router.push(next);
  }, [router, next]);
  useArrowKeys(onLeft, onRight);
  return null;
}
