/* Right-rail container + registry dispatch (>=xl only): which context
   renders is decided by railFor(pathname) (right-rail.ts; the pathname
   comes from x-kb-path written by proxy.ts, read uniformly by the
   layout); the container only owns sticky layout and the w-72 width.
   Hide/show is pure CSS (html[data-sidebar], see globals.css) with SSR
   first paint emitting the same state from the cookie; the toggle
   lives in the left rail's "interface" group (pref-controls'
   SidebarToggle) — hidden means the whole column folds away, no thin
   track with a reopen button. */
import type { Locale } from "@/src/lib/i18n";
import type { RailDecision } from "./right-rail";
import ArticleRail from "./rail/ArticleRail";
import AwesomeRail from "./rail/AwesomeRail";
import CommunityWidgets from "./rail/CommunityWidgets";
import ExploreRail from "./rail/ExploreRail";
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
        ) : decision.kind === "explore" ? (
          <ExploreRail locale={locale} />
        ) : decision.kind === "article" && decision.slug ? (
          <ArticleRail slug={decision.slug} locale={locale} />
        ) : decision.kind === "about" ? (
          <CommunityWidgets locale={locale} showAbout={false} />
        ) : (
          <CommunityWidgets locale={locale} />
        )}
      </div>
    </aside>
  );
}
