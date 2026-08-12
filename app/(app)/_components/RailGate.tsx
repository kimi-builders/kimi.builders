"use client";

/* 右栏一致性闸门:右栏由布局按 x-kb-path 分发,布局在软导航时不重渲染,
   靠 RailRefresher 的 router.refresh() 事后纠正——那一拍里右栏仍是上一页的
   内容。这里在客户端比对当前 pathname 与本栏渲染时的 path:不一致即隐藏
   (visibility 保留栏位、不响应交互),纠正后的新右栏到达再显示。
   消除「中列已是新页面、右栏还是旧页面」的错位窗口。
   注意:本包裹层承担 aside 的栏位类(self-stretch 让内部 sticky 有滑动空间)。 */
import { usePathname } from "next/navigation";

export default function RailGate({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  const stale = usePathname() !== path;
  return (
    <div
      aria-hidden={stale}
      className={`hidden shrink-0 self-stretch transition-opacity duration-150 lg:ml-2 xl:block ${
        stale ? "pointer-events-none invisible opacity-0" : ""
      }`}
    >
      {children}
    </div>
  );
}
