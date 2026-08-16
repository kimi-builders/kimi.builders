/* 功能区分区外壳:固定顶栏(≥lg,全局:品牌/通知/主题/语言/登录态)
   + 左栏(功能菜单)+ 内容列 + 右栏(路由上下文,注册表分发)。
   作用于 (app) 路由组内所有分区;首页门面不在组内,保持独立暗色海报。
   右栏上下文与主列宽度由 railFor(pathname) 决定(right-rail.ts;
   pathname 由根 proxy.ts 写进 x-kb-path 请求头)。
   注意:布局在软导航时不重渲染,所以 <RailRefresher/> 监听 rail decision 变化
   调 router.refresh(),让本布局按新上下文重新求值(同 decision 导航不重取);
   refresh 往返的那一拍里 <RailGate/> 按当前 decision 把旧右栏隐藏,
   中列新页面与右栏旧内容不会同框出现。
   三栏的收起/隐藏状态走 <html> data-* + CSS(root layout 直出),
   壳组件不接收状态 prop,切换零网络。 */
import { Suspense } from "react";
import { headers } from "next/headers";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { canModerate } from "@/src/lib/featured";
import { getUnreadNotificationCount } from "@/src/lib/posts";
import LeftNav from "./_components/LeftNav";
import MobileTabBar from "./_components/MobileTabBar";
import MobileTopBar from "./_components/MobileTopBar";
import RailGate from "./_components/RailGate";
import RailRefresher from "./_components/RailRefresher";
import RightSidebar from "./_components/RightSidebar";
import TopBar from "./_components/TopBar";
import { railDecisionKey, railFor } from "./_components/right-rail";

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
  /* 管理台入口:仅 admin/mod(20260830);/admin 路由本身服务端再 404 兜底 */
  const moderator = !!user && canModerate(user.role);
  /* proxy 未覆盖的路径(头缺失)按回落处理:community rail + 正常列宽 */
  const railPath = headerStore.get("x-kb-path") ?? "/";
  const rail = railFor(railPath);
  const railKey = railDecisionKey(rail);
  return (
    <div>
      <MobileTopBar locale={locale} unread={unread} profileHref={profileHref} moderator={moderator} loggedIn={!!user} />
      {/* 桌面固定顶栏(≥lg);内容区 lg:pt-14 让位 */}
      <TopBar locale={locale} unread={unread} loggedIn={!!user} />
      {/* 三栏统一收进 1320 居中容器:栏间距固定,宽屏只剩两侧等宽留白,
          左栏不再贴视口缘;主列 ≥lg 带竖向 hairline 缝合版面 */}
      <div className="mx-auto flex w-full max-w-[1320px] items-start gap-6 lg:pt-14">
        {/* LeftNav 用 usePathname 做激活态,Suspense 兜底 */}
        <Suspense fallback={null}>
          <LeftNav locale={locale} profileHref={profileHref} moderator={moderator} loggedIn={!!user} />
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
          /* 跨上下文软导航的一拍里右栏还是上一页的:RailGate 按当前 decision 把它
             藏起来,refresh 带新右栏到达后再显示(不再出现中列/右栏错位) */
          <RailGate decisionKey={railKey}>
            <RightSidebar locale={locale} loggedIn={!!user} decision={rail} />
          </RailGate>
        )}
      </div>
      <Suspense fallback={null}>
        <MobileTabBar locale={locale} profileHref={profileHref} loggedIn={!!user} />
      </Suspense>
      {/* 软导航跨上下文时让布局重估右栏/列宽(同 decision 不全树重取) */}
      <RailRefresher />
    </div>
  );
}
