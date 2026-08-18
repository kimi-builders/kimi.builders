/* 右栏容器 + 注册表分发(仅 ≥xl):渲染哪种上下文由 railFor(pathname) 决定
   (right-rail.ts;pathname 来自 proxy.ts 写入的 x-kb-path,layout 统一读表),
   容器只负责 sticky 布局与 w-72 栏宽。
   隐藏/显示纯 CSS 驱动(html[data-sidebar],见 globals.css),SSR 首屏按
   cookie 直出同一状态;开关在左栏「界面」组(pref-controls 的 SidebarToggle),
   隐藏后本栏整体收起,不再留细轨重开按钮。 */
import type { Locale } from "@/src/lib/i18n";
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
    <aside className="rightsidebar sticky top-14 shrink-0 py-8">
      <div className="sidebar-full w-72 shrink-0 space-y-4">
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
      </div>
    </aside>
  );
}
