"use client";

/* 软导航后强制刷新服务端树:布局持有按 pathname 分发的右栏(railFor),
   但 App Router 的布局在客户端导航时不重渲染(缓存组件/Activity 语义下
   template.tsx 也无法可靠做到——已实测往返导航状态错乱)。router.refresh()
   会让服务端按当前 URL 重新执行布局与页面,右栏随即正确。 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function RailRefresher() {
  const pathname = usePathname();
  const router = useRouter();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    router.refresh();
  }, [pathname, router]);

  return null;
}
