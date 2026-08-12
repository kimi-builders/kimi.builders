"use client";

/* 软导航跨右栏上下文时刷新服务端树:布局持有按 pathname 分发的右栏(railFor),
   但 App Router 的布局在客户端导航时不重渲染(缓存组件/Activity 语义下
   template.tsx 也无法可靠做到——已实测往返导航状态错乱)。同一 decision
   (kind + 详情 id + wide)无需重取;decision 改变才 refresh 纠正右栏与列宽。 */
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
