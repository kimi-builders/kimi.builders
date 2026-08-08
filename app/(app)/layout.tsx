/* 功能区分区外壳:三栏应用壳(左=顶级导航,中=内容,右=社区 widget)。
   作用于 (app) 路由组内所有分区(当前 /community,后续 /learn /works …);
   首页门面不在组内,保持独立暗色海报。
   右栏内容目前是社区向 widget;新分区落地时再按区分化。
   三栏的收起/隐藏状态走 <html> data-* + CSS(root layout 直出),
   壳组件不接收状态 prop,切换零网络。 */
import { Suspense } from "react";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getUnreadNotificationCount } from "@/src/lib/posts";
import LeftNav from "./_components/LeftNav";
import MobileTabBar from "./_components/MobileTabBar";
import MobileTopBar from "./_components/MobileTopBar";
import RightSidebar from "./_components/RightSidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const [locale, unread] = await Promise.all([
    getLocale(user),
    user ? getUnreadNotificationCount(user.id) : 0,
  ]);
  return (
    <div>
      <MobileTopBar />
      <div className="mx-auto flex max-w-[1200px] items-start gap-8 px-4 lg:px-6">
        {/* LeftNav 用 usePathname 做激活态,Suspense 兜底 */}
        <Suspense fallback={null}>
          <LeftNav locale={locale} unread={unread} />
        </Suspense>
        {/* 移动端 pb-24 给底部标签栏腾位;lg+ 恢复常规 */}
        <main className="w-full min-w-0 max-w-[680px] flex-1 py-6 pb-24 lg:py-8">
          {children}
        </main>
        <RightSidebar locale={locale} loggedIn={!!user} />
      </div>
      <Suspense fallback={null}>
        <MobileTabBar locale={locale} unread={unread} />
      </Suspense>
    </div>
  );
}
