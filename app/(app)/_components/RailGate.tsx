"use client";

/* 右栏一致性闸门:右栏由布局按 x-kb-path 分发,布局在软导航时不重渲染,
   靠 RailRefresher 的 router.refresh() 事后纠正——那一拍里右栏仍是上一页的
   内容。这里在客户端比对当前 decision 与本栏渲染时的 decision:不一致即隐藏
   (visibility 保留栏位、不响应交互),纠正后的新右栏到达再显示;同一上下文
   的 pathname 变化则保持显示。
   消除「中列已是新页面、右栏还是旧页面」的错位窗口。
   注意:本包裹层承担 aside 的栏位类(self-stretch 让内部 sticky 有滑动空间),
   railgate 钩子供右栏隐藏时整列退出 flex 布局(globals.css 的 data-sidebar 块)。 */
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
      className={`railgate hidden shrink-0 self-stretch transition-opacity duration-150 lg:ml-2 xl:block ${
        stale ? "pointer-events-none invisible opacity-0" : ""
      }`}
    >
      {children}
    </div>
  );
}
