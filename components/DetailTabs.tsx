"use client";

/* 详情页 Tabs(20260821 探索区,参考 website 的 DetailTabs 机制):
   · 所有面板全部 SSR 渲染,非激活只加 hidden(无 JS 时全可见,优雅降级);
   · 激活态初始值由服务端从 ?tab= 读入(initialTab,SSR 不出错配);
   · 点击切换 + history.replaceState 同步 URL(首个 tab 删参数,URL 干净),
     popstate 回同步;方向键/ Home/End 循环切换,focus 不跳滚动。 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";

export interface DetailTab {
  id: string;
  label: string;
  panel: ReactNode;
}

export default function DetailTabs({
  tabs,
  initialTab,
  ariaLabel,
}: {
  tabs: DetailTab[];
  /* 服务端从 searchParams.tab 读入;非法/缺省 = 第一个 tab */
  initialTab?: string;
  ariaLabel: string;
}) {
  const first = tabs[0]?.id ?? "";
  const [active, setActive] = useState(
    initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : first,
  );
  const listRef = useRef<HTMLDivElement>(null);

  /* 浏览器前进/后退:URL 的 ?tab= 回同步进 state */
  useEffect(() => {
    const onPop = () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      setActive(t && tabs.some((x) => x.id === t) ? t : first);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tabs, first]);

  const select = (id: string, focus = false) => {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === first) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
    if (focus) {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)
        ?.focus({ preventScroll: true });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      select(tabs[next].id, true);
    }
  };

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={SEG_WRAP}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={active === t.id}
            aria-controls={`detail-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={`${SEG_ITEM} cursor-pointer ${
              active === t.id ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`detail-panel-${t.id}`}
          role="tabpanel"
          hidden={active !== t.id}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
