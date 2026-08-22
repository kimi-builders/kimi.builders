/* Server assembly of one page of the works list: keyset paging + claim
   badge data (two batched IN queries, no N+1) + card rendering. Shared
   by the /works and /awesome first pages and their "load more" server
   actions so both entries emit identical output (same pattern as
   comment-page.tsx). Badges (claim-based): only on the /works member
   wall; /awesome neither queries nor carries them. Definition: this
   work's claimed_tokens with the author's sum of claims <= their
   verifiable total (the internal query in usage/verifiable.ts, no
   opt-in gate; the total itself is never displayed). A broken
   invariant (shrunk total) -> none of that author's cards carry a
   badge, and the author alone sees a redistribution hint line
   (claimPaused, author-visible only — no negative signaling). */
import type { ReactNode } from "react";
import type { SessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import type { Locale } from "@/src/lib/i18n";
import { getPublicWorksFirstPage } from "@/src/lib/public-works-cache";
import { publicWorksCacheScope } from "@/src/lib/public-works";
import type { WorksView } from "@/src/lib/works-view";
import { getVerifiableTokenTotals } from "@/src/lib/usage/verifiable";
import {
  claimBadgeOf,
  claimsPaused,
  getAwesomeWorksPage,
  getWorkClaimSums,
  getWorksPage,
} from "@/src/lib/works";
import WorkCard from "./WorkCard";
import WorkGridCard from "./WorkGridCard";

export interface WorksPageData {
  nodes: ReactNode[];
  nextCursor: string | null;
}

export async function loadWorksCards(
  scope: {
    awesome: boolean;
    sort?: "hot" | "new";
    agents?: string[];
    kinds?: string[];
    scope_?: string;
    view?: WorksView;
  },
  user: SessionUser | null,
  locale: Locale,
  after?: string,
): Promise<WorksPageData> {
  const queryOpts = {
    sort: scope.sort,
    agents: scope.agents,
    kinds: scope.kinds,
    after,
    viewerId: user?.id,
  };
  const publicScope = publicWorksCacheScope({
    awesome: scope.awesome,
    ...queryOpts,
    scope_: scope.scope_,
  });
  const page = publicScope
    ? await getPublicWorksFirstPage(publicScope)
    : scope.awesome
      ? await getAwesomeWorksPage({ ...queryOpts, scope: scope.scope_ })
      : await getWorksPage(queryOpts);
  const authorIds = page.works.map((w) => w.userId);
  const [totals, claimSums] = scope.awesome
    ? [new Map<number, number>(), new Map<number, number>()]
    : await Promise.all([
        getVerifiableTokenTotals(authorIds),
        getWorkClaimSums(authorIds),
      ]);
  /* admin/mod see feature/unfeature entries on /works cards (weekly
     featured v0); /awesome keeps its original scope without them. */
  const canFeature = !scope.awesome && !!user && canModerate(user.role);
  /* The author's own over-cap claim state (an author-visible
     redistribution hint; badge hiding is claimBadgeOf's job). */
  const myPaused = user
    ? claimsPaused(totals.get(user.id) ?? 0, claimSums.get(user.id) ?? 0)
    : false;
  /* View: grid = cover wall (WorkGridCard), list = rows (WorkCard,
     default); /u/[handle] passes no view and is always rows. */
  const Card = scope.view === "grid" ? WorkGridCard : WorkCard;
  return {
    nodes: page.works.map((w) => (
      <Card
        key={w.id}
        work={w}
        locale={locale}
        meId={user?.id ?? null}
        canFeature={canFeature}
        claimBadge={claimBadgeOf(w, totals, claimSums)}
        claimPaused={myPaused}
      />
    )),
    nextCursor: page.nextCursor,
  };
}
