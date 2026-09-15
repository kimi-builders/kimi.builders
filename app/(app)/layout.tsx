/* Section shell: a fixed top bar (>=lg, spanning only the region right
   of the left rail: notifications/theme/language/auth) + left rail
   (function menu, edge-flush and full height) + content column + right
   rail (route context, registry-dispatched). Applies to every section
   in the (app) route group; the home facade stays outside the group,
   keeping its independent dark poster. The rail context and main
   column width come from railFor(pathname) (right-rail.ts; the
   pathname rides the x-kb-path request header written by the root
   proxy.ts). Note: layouts don't re-render on soft navigation, so
   <RailRefresher/> watches rail-decision changes and calls
   router.refresh() to re-evaluate this layout under the new context
   (same-decision navigations don't refetch); during the refresh round
   trip <RailGate/> hides the stale rail per the current decision, so
   the new main column and the old rail never share a frame. The three
   columns' collapsed/hidden states ride <html> data-* + CSS (emitted
   by the root layout) — shell components take no state props, and
   toggling costs no network. */
import { Suspense } from "react";
import { headers } from "next/headers";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { canModerate } from "@/src/lib/featured";
import { getUnreadNotificationCount } from "@/src/lib/posts";
import { getWorksSource } from "@/src/lib/works-view-server";
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
  const [locale, unread, headerStore, worksSrc] = await Promise.all([
    getLocale(user),
    user ? getUnreadNotificationCount(user.id) : 0,
    headers(),
    /* The left rail's works/Awesome highlight initial value: detail
       pages activate by the source list; after soft navigation LeftNav
       reads the latest cookie itself (the layout doesn't re-render). */
    getWorksSource(),
  ]);
  const profileHref = user ? `/u/${user.handle}` : undefined;
  /* Admin console entry: admin/mod only; the /admin route itself
     404s server-side as the backstop. */
  const moderator = !!user && canModerate(user.role);
  /* Paths the proxy doesn't cover (missing header) fall back:
     community rail + normal column width. */
  const railPath = headerStore.get("x-kb-path") ?? "/";
  const rail = railFor(railPath);
  const railKey = railDecisionKey(rail);
  return (
    <div>
      <MobileTopBar locale={locale} unread={unread} profileHref={profileHref} moderator={moderator} loggedIn={!!user} />
      {/* Fixed desktop top bar (>=lg); the content area yields via lg:pt-14 */}
      <TopBar locale={locale} unread={unread} loggedIn={!!user} />
      {/* Edge-flush shell: the left rail hugs the viewport's left edge
          full height; everything else lives in the region right of it.
          The zone inside centers with a 1200px cap — main column (848
          rail-on / 1152 wide-canvas) + 16 gap + 288 rail = 1152 inner,
          exact fill, so the rail always hugs the zone's right edge and
          the top bar's right-most control stays flush with it.
          Ultrawide screens add equal side margins around the zone
          (Reddit-style centering) instead of stretching the reading
          measure, and the main column never narrows as the viewport
          grows (the old px-[5vw] + 1440-cap container did). */}
      <div className="flex w-full items-start">
        {/* LeftNav derives its active state from usePathname; Suspense is the fallback */}
        <Suspense fallback={null}>
          <LeftNav locale={locale} profileHref={profileHref} moderator={moderator} loggedIn={!!user} worksSrc={worksSrc} />
        </Suspense>
        {/* Content region: yields to the fixed desktop top bar via
            lg:pt-14; mobile keeps pb-24 for the bottom tab bar inside
            the main column. wide routes (usage / profile) open the zone
            to a 1152px analytics canvas, everything else an 848px
            column (padding included). The maincol-rail hook widens the
            main column to the same 1152 when the right rail is hidden
            (the html[data-sidebar="0"] block in globals.css), so
            toggling the menu never jumps; wide routes have no rail and
            stay out of it. */}
        <div className="min-w-0 flex-1 lg:pt-14">
          <div className="mx-auto flex w-full max-w-[1200px] items-start gap-4 px-4 lg:px-6">
            <main
              className={`maincol w-full min-w-0 flex-1 py-6 pb-24 lg:border-r lg:border-line lg:pr-6 lg:py-8 ${
                rail.wide ? "lg:max-w-[1152px]" : "maincol-rail lg:max-w-[848px]"
              }`}
            >
              {children}
            </main>
            {rail.kind !== "none" && (
              /* For one beat of a cross-context soft navigation the rail still
                 shows the previous page: RailGate hides it per the current
                 decision until the refresh delivers the new rail (no more
                 column/rail mismatch). */
              <RailGate decisionKey={railKey}>
                <RightSidebar locale={locale} loggedIn={!!user} decision={rail} />
              </RailGate>
            )}
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <MobileTabBar
          locale={locale}
          profileHref={profileHref}
          loggedIn={!!user}
          worksSrc={worksSrc}
        />
      </Suspense>
      {/* Soft navigation across contexts re-evaluates the rail/column widths (same decision, no full-tree refetch) */}
      <RailRefresher />
    </div>
  );
}
