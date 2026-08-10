/* 右栏容器 + 注册表分发(仅 ≥xl):渲染哪种上下文由 railFor(pathname) 决定
   (right-rail.ts;pathname 来自 proxy.ts 写入的 x-kb-path,layout 统一读表),
   容器只负责 sticky 布局、w-72 与「隐藏/细轨重开」偏好。
   隐藏/显示纯 CSS 驱动(html[data-sidebar],见 globals.css):两种状态的结构
   常渲染,切换零网络;SSR 首屏按 cookie 直出同一状态。 */
import type { Locale } from "@/src/lib/i18n";
import { SidebarToggle } from "./pref-controls";
import type { RailDecision } from "./right-rail";
import AwesomeRail from "./rail/AwesomeRail";
import BlogRail from "./rail/BlogRail";
import CommunityWidgets from "./rail/CommunityWidgets";
import LearnRail from "./rail/LearnRail";
import PostRail from "./rail/PostRail";
import WorkRail from "./rail/WorkRail";
import WorksRail from "./rail/WorksRail";

export default function RightSidebar({
  locale,
  loggedIn,
  decision,
}: {
  locale: Locale;
  loggedIn: boolean;
  decision: RailDecision;
}) {
  return (
    <aside className="rightsidebar sticky top-14 hidden shrink-0 py-8 lg:ml-2 xl:block">
      <div className="sidebar-full w-80 shrink-0 space-y-4">
        {decision.kind === "post" && decision.id !== null ? (
          <PostRail id={decision.id} locale={locale} />
        ) : decision.kind === "work" && decision.id !== null ? (
          <WorkRail id={decision.id} locale={locale} />
        ) : decision.kind === "works" ? (
          <WorksRail locale={locale} loggedIn={loggedIn} />
        ) : decision.kind === "awesome" ? (
          <AwesomeRail locale={locale} loggedIn={loggedIn} />
        ) : decision.kind === "blog" ? (
          <BlogRail locale={locale} />
        ) : decision.kind === "learn" ? (
          <LearnRail locale={locale} />
        ) : (
          <CommunityWidgets locale={locale} />
        )}
        <SidebarToggle variant="full" locale={locale} />
      </div>

      {/* 隐藏后留下的细轨重开按钮(CSS 按 html[data-sidebar] 二选一显示) */}
      <div className="sidebar-rail pt-8">
        <SidebarToggle variant="rail" locale={locale} />
      </div>
    </aside>
  );
}
