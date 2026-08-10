/* 功能区分区外壳:固定顶栏(≥lg,全局:品牌/通知/主题/语言/登录态)
   + 左栏(贴视口左缘的功能菜单)+ 内容列 + 右栏(路由上下文,注册表分发)。
   作用于 (app) 路由组内所有分区;首页门面不在组内,保持独立暗色海报。
   右栏上下文与主列宽度由 railFor(pathname) 决定(right-rail.ts;
   pathname 由根 proxy.ts 写进 x-kb-path 请求头)——usage/个人主页无右栏且加宽,
   原先的 :has(> .usage-dashboard) hack 收编进注册表。
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
      <div className="flex items-start gap-8 lg:pt-14 lg:pr-6">
        {/* LeftNav 用 usePathname 做激活态,Suspense 兜底 */}
        <Suspense fallback={null}>
          <LeftNav locale={locale} profileHref={profileHref} />
        </Suspense>
        {/* 主列居中于剩余空间;移动端 pb-24 给底部标签栏腾位;lg+ 恢复常规。
            wide(usage / 个人主页)放宽到 1120 分析画布,其余 680 阅读列 */}
        <main
          className={`mx-auto w-full min-w-0 flex-1 px-4 py-6 pb-24 lg:px-0 lg:py-8 ${
            rail.wide ? "max-w-[1120px]" : "max-w-[680px]"
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
    </div>
  );
}
