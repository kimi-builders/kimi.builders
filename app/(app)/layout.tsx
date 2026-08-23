/* Section shell: a fixed top bar (>=lg, global: brand/notifications/
   theme/language/auth) + left rail (function menu) + content column +
   right rail (route context, registry-dispatched). Applies to every
   section in the (app) route group; the home facade stays outside the
   group, keeping its independent dark poster. The rail context and
   main column width come from railFor(pathname) (right-rail.ts; the
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
      {/* All three columns share one 1320px centered container: gutters
          stay fixed and wide screens only add equal side margins, so the
          left column never hugs the viewport edge; >=lg a vertical hairline
          on the main column stitches the layout together. */}
      <div className="mx-auto flex w-full max-w-[1440px] items-start gap-4 px-[5vw] lg:pt-14">
        {/* LeftNav derives its active state from usePathname; Suspense is the fallback */}
        <Suspense fallback={null}>
          <LeftNav locale={locale} profileHref={profileHref} moderator={moderator} loggedIn={!!user} worksSrc={worksSrc} />
        </Suspense>
        {/* The main column hugs the container's left; mobile keeps pb-24 for
            the bottom tab bar, restored at lg+. wide routes (usage /
            profile) open up to a 1000px analytics canvas, everything else a
            720px reading column (padding included). The maincol-rail hook
            widens the main column when the right rail is hidden (the
            html[data-sidebar="0"] block in globals.css moves 720 -> 1000,
            matching the wide canvas so toggling the menu never jumps); wide
            routes have no right rail and stay out of it. */}
        <main
          className={`maincol w-full min-w-0 flex-1 px-4 py-6 pb-24 lg:border-x lg:border-line lg:px-6 lg:py-8 ${
            rail.wide ? "lg:max-w-[1040px]" : "maincol-rail lg:max-w-[800px]"
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
