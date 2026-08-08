/* 社区分区外壳:三栏应用壳(参考 VibeCafé / Laracasts)。
   左栏导航(可收成图标轨,cookie 记忆)+ 内容栏(≤680px 阅读宽)+
   右栏 widget(仅 ≥xl,可整体关掉);<lg 退化为顶部 mini 栏。
   壳只作用于 /community 分区,首页门面与后续 /learn 等各自为政。 */
import { Suspense } from "react";
import { getSessionUser } from "@/src/lib/auth/session";
import { getUiPrefs } from "@/src/lib/prefs";
import LeftNav from "./_components/LeftNav";
import MobileTopBar from "./_components/MobileTopBar";
import RightSidebar from "./_components/RightSidebar";

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, prefs] = await Promise.all([getSessionUser(), getUiPrefs()]);
  return (
    <div>
      <MobileTopBar />
      <div className="mx-auto flex max-w-[1200px] items-start gap-8 px-4 lg:px-6">
        {/* LeftNav 用 useSearchParams 做激活态,Suspense 兜底 */}
        <Suspense fallback={null}>
          <LeftNav
            user={user ? { handle: user.handle, avatarUrl: user.avatarUrl } : null}
            collapsed={prefs.navCollapsed}
          />
        </Suspense>
        <main className="w-full min-w-0 max-w-[680px] flex-1 py-6 lg:py-8">
          {children}
        </main>
        <RightSidebar hidden={prefs.sidebarHidden} />
      </div>
    </div>
  );
}
