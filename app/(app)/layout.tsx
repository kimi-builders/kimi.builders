/* 功能区分区外壳:固定顶栏(≥lg,全局:品牌/通知/主题/语言/登录态)
   + 左栏(功能菜单)+ 内容列 + 右栏(路由上下文,注册表分发)。
   作用于 (app) 路由组内所有分区;首页门面不在组内,保持独立暗色海报。
   右栏上下文与主列宽度由 railFor(pathname) 决定(right-rail.ts;
   pathname 由根 proxy.ts 写进 x-kb-path 请求头)。
   注意:布局在软导航时不重渲染,所以 <RailRefresher/> 监听 pathname 变化
   调 router.refresh(),让本布局按新 URL 重新求值(右栏/列宽随页面切换)。
   三栏的收起/隐藏状态走 <html> data-* + CSS(root layout 直出),
   壳组件不接收状态 prop,切换零网络。 */
import { Suspense } from "react";
import { headers } from "next/headers";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getUnreadNotificationCount } from "@/src/lib/posts";
import LeftNav from "./_components/LeftNav";
import MobileTabBar from "./_components/MobileTabBar";
import MobileTopBar from "./_components/MobileTopBar";
import RailRefresher from "./_components/RailRefresher";
import RightSidebar from "./_components/RightSidebar";
import TopBar from "./_components/TopBar";
import { railFor } from "./_components/right-rail";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const [locale, unread, headerStore] = await Promise.all([
    getLocale(user),
    user ? getUnreadNotificationCount(user.id) : 0,
    headers(),
  ]);
  const profileHref = user ? `/u/${user.handle}` : undefined;
  /* proxy 未覆盖的路径(头缺失)按回落处理:community rail + 正常列宽 */
  const rail = railFor(headerStore.get("x-kb-path") ?? "/");
  return (
    <div>
      <MobileTopBar locale={locale} unread={unread} profileHref={profileHref} />
      {/* 桌面固定顶栏(≥lg);内容区 lg:pt-14 让位 */}
      <TopBar locale={locale} unread={unread} loggedIn={!!user} />
      {/* 三栏统一收进 1320 居中容器:栏间距固定,宽屏只剩两侧等宽留白,
          左栏不再贴视口缘;主列 ≥lg 带竖向 hairline 缝合版面 */}
      <div className="mx-auto flex w-full max-w-[1320px] items-start gap-6 lg:pt-14">
        {/* LeftNav 用 usePathname 做激活态,Suspense 兜底 */}
        <Suspense fallback={null}>
          <LeftNav locale={locale} profileHref={profileHref} />
        </Suspense>
        {/* 主列在容器内靠左;移动端 pb-24 给底部标签栏腾位;lg+ 恢复常规。
            wide(usage / 个人主页)放宽到 1000 分析画布,其余 720 阅读列(含两侧 padding) */}
        <main
          className={`w-full min-w-0 flex-1 px-4 py-6 pb-24 lg:border-x lg:border-line lg:px-6 lg:py-8 ${
            rail.wide ? "lg:max-w-[1000px]" : "lg:max-w-[720px]"
          }`}
        >
          {children}
        </main>
        {rail.kind !== "none" && (
          <RightSidebar locale={locale} loggedIn={!!user} decision={rail} />
        )}
      </div>
      <Suspense fallback={null}>
        <MobileTabBar locale={locale} profileHref={profileHref} />
      </Suspense>
      {/* 软导航后让布局按新 URL 重估右栏/列宽(布局本身不随导航重渲染) */}
      <RailRefresher />
    </div>
  );
}
