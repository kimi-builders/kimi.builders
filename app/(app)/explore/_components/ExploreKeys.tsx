"use client";

/* 探索区页面级方向键(20260822 快捷键方案):
   - ChapterKeys(列表页):←→ 在「全部 + 有内容的章」间循环,目标 href
     由服务端用 lensHref 算好传入——透镜(产品/标签等)随章保留;
   - ArticleKeys(详情页):←上一篇(更早)/ →下一篇(更新),与 letter
     页脚的期次导航同一方向语义;到头不回绕。
   守卫复用全局层同一纯函数(修饰键/输入态/弹窗态/IME)。 */
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
