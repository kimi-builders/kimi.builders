/* Right-rail registry: dispatches rail context by route segment and
   also gives the main column width (the usage :has widening hack
   collected here; the profile widens too). railFor is a pure function
   unit-tested in tests/right-rail.test.ts; the pathname arrives via
   the x-kb-path request header written by the root proxy.ts, and
   (app)/layout.tsx reads the table on server-tree refetch. kind=none
   -> no rail; wide -> the main column's max-w relaxes to 1000 (analytics
   canvases). Unlisted routes (/demo-night, /community
   subpages, ...) fall back to community — same behavior as the
   pre-rework "one widget site-wide". Not-yet-ready sections' dedicated
   rails also fall back to community, so the "on its way" placeholder
   never sits beside an empty rail. */
import { UPCOMING } from "@/src/lib/upcoming";

export type RailKind =
  | "community"
  | "post"
  | "work"
  | "works"
  | "awesome"
  | "explore"
  | "article"
  | "none";

export interface RailDecision {
  kind: RailKind;
  /* The route id for post/work detail; always null for other kinds
     (only the notifications page uses the 0 sentinel — same rail but
     forcing a shell re-evaluation, see the railFor comment). */
  id: number | null;
  /* The article detail's (/explore/<slug>) slug; non-empty only for
     kind=article. */
  slug?: string | null;
  /* Main column widened (1000); currently only the kind=none wide
     canvas routes. */
  wide: boolean;
}

/* The minimal context the layout needs to refetch: same rail + same
   detail id/slug + same column width means a pathname change can't
   affect the rail or shell width — no router.refresh() full-tree
   refetch needed. */
export function railDecisionKey({ kind, id, slug, wide }: RailDecision): string {
  return `${kind}:${slug ?? id ?? "-"}:${wide ? 1 : 0}`;
}

const decision = (
  kind: RailKind,
  opts: { id?: number; slug?: string; wide?: boolean } = {},
): RailDecision => ({
  kind,
  id: opts.id ?? null,
  /* The slug rides only article decisions (optional, absent by default
     — compatible with the existing deepEqual tests). */
  ...(opts.slug !== undefined ? { slug: opts.slug } : {}),
  wide: opts.wide ?? false,
});

export function railFor(pathname: string): RailDecision {
  /* Trailing slash stripped; empty treated as root. */
  const p = pathname.replace(/\/+$/, "") || "/";

  /* Wide canvas, no rail: the usage area (device/leaderboard subpages
     included) and the profile. */
  if (p === "/usage" || p.startsWith("/usage/")) {
    return decision("none", { wide: true });
  }
  if (p.startsWith("/u/")) return decision("none", { wide: true });
  /* Admin console: no rail, wide canvas. */
  if (p === "/admin" || p.startsWith("/admin/")) {
    return decision("none", { wide: true });
  }
  /* Settings: no rail, wide canvas — a self-contained forms page (same
     tier as the profile and admin); the community fallback put a
     context rail beside a settings list and squeezed the three columns
     at laptop widths. */
  if (p === "/settings" || p.startsWith("/settings/")) {
    return decision("none", { wide: true });
  }

  /* The notifications page shares the feed's community rail, but a
     visit marks everything read (markNotificationsRead runs during
     page render): it gets its own decision key so entering and leaving
     each force one full-tree refetch and the shell's unread badge
     clears immediately; id=0 is a sentinel, not a detail id. */
  if (p === "/community/notifications") return decision("community", { id: 0 });

  /* Detail pages: exact matches /community/<id> and /works/<id> only
     (subpages like /edit don't count). */
  const post = /^\/community\/(\d+)$/.exec(p);
  if (post) return decision("post", { id: Number(post[1]) });
  const work = /^\/works\/(\d+)$/.exec(p);
  if (work) return decision("work", { id: Number(work[1]) });

  /* Works list: /works has its own rail (submit entry + hot works +
     claim semantics explainer). */
  if (p === "/works") return decision("works");

  if (p === "/awesome") return decision("awesome");
  /* Explore: the catalog and series pages use the explore rail;
     article detail (/explore/<slug>, non-series) uses the article rail
     (metadata in the rail, slug in the decision key for shell
     re-evaluation). While the section isn't ready (UPCOMING.explore)
     everything falls back to community; the legacy /blog and /learn
     routes are 301s with no rail branches. */
  if (!UPCOMING.explore && (p === "/explore" || p.startsWith("/explore/"))) {
    if (p.startsWith("/explore/series/")) return decision("explore");
    if (p !== "/explore") {
      return decision("article", { slug: p.slice("/explore/".length) });
    }
    return decision("explore");
  }

  /* Fallback: the community feed and every unlisted route
     (/community/new, /settings, /demo-night ...). */
  return decision("community");
}
