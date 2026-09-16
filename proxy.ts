/* Next 16 proxy (formerly middleware): writes the current pathname into
   the x-kb-path request header; the (app) shell's rail registry
   (right-rail.ts railFor) dispatches context by it server-side. Covers
   (app) route-group page paths only; unmatched requests lack the
   header and the registry falls back to community. Also records the
   "source list" cookie: /works and /awesome are both work lists, and
   the detail/form "back" should return to the one the user came from —
   more accurate than guessing by work.source (member works also
   appear on /awesome). Written only on the list pages themselves
   (details/publish/edit never overwrite). */
import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "./src/lib/db";
import { findLearnSeries } from "./src/lib/learn-series";
import { UPCOMING } from "./src/lib/upcoming";
import type { RowDataPacket } from "mysql2";

/* Legacy /blog and /learn paths merged into /explore (20260821). The
   real 308 must leave here, before render: page-level redirects land
   after the shell's loading boundaries flush, so they degrade to a 200
   + meta-refresh. The page stubs under (app)/blog and (app)/learn stay
   as the fallback if these matcher entries ever go away; /blog/admin/*
   (the edit console) is NOT redirected. */
function legacyExploreRedirect(request: NextRequest): NextResponse | null {
  const seg = request.nextUrl.pathname.split("/").filter(Boolean);
  let target: string | null = null;
  if (seg[0] === "blog" && seg[1] !== "admin") {
    if (seg.length === 1) target = "/explore";
    else if (seg.length === 2) target = `/explore/${seg[1]}`;
  } else if (seg[0] === "learn") {
    if (seg.length === 1) target = "/explore";
    else if (seg.length === 2) target = `/explore/series/${seg[1]}`;
    else if (seg.length === 3) target = `/explore/${seg[2]}`;
  }
  if (!target) return null;
  const url = request.nextUrl.clone();
  url.pathname = target;
  /* /blog/<slug> carried only ?tab= through (the detail-page anchor). */
  const tab = seg[0] === "blog" && seg.length === 2 ? request.nextUrl.searchParams.get("tab") : null;
  url.search = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  return NextResponse.redirect(url, 308);
}

/* Detail-route soft-404 guard (same lever as the series check below):
   notFound() thrown under a loading boundary commits a streamed 200
   first, so crawlers and link unfurlers see private/deleted/unpublished
   details as existing pages. The proxy runs on the Node runtime (Next
   16 default) and can ask the DB directly:
   - deleted (posts/articles) or missing rows: 404 for everyone —
     nobody can view them through the public route;
   - private/hidden (posts, works): 404 only for session-less visitors;
     the page still decides for signed-in ones (author/mods view).
   The query fn is injectable so unit tests pin the matrix without a
   database; fail-open on query trouble (the page-level guard stays the
   only gate). */
export type ProxyQuery = (
  sql: string,
  args: (number | string)[],
) => Promise<RowDataPacket[]>;

export async function detailLooksMissing(
  segments: string[],
  hasSession: boolean,
  query: ProxyQuery,
): Promise<boolean> {
  try {
    if (segments.length === 2 && (segments[0] === "community" || segments[0] === "works")) {
      const id = Number(segments[1]);
      if (!Number.isInteger(id) || id <= 0) return false;
      if (segments[0] === "community") {
        const rows = await query(
          "SELECT deleted_at, visibility, hidden_at FROM posts WHERE id = ? LIMIT 1",
          [id],
        );
        const r = rows[0];
        if (!r || r.deleted_at !== null) return true;
        return (r.visibility !== "public" || r.hidden_at !== null) && !hasSession;
      }
      const rows = await query(
        "SELECT visibility, hidden_at FROM works WHERE id = ? LIMIT 1",
        [id],
      );
      const r = rows[0];
      if (!r) return true;
      return (r.visibility !== "public" || r.hidden_at !== null) && !hasSession;
    }
    if (segments.length === 2 && segments[0] === "explore") {
      /* Bilingual rows share a slug; the page is live when any locale
         row is published and not deleted. Drafts/deleted are invisible
         to everyone on the public route. */
      let slug: string;
      try {
        slug = decodeURIComponent(segments[1]);
      } catch {
        return true;
      }
      const rows = await query(
        "SELECT published_at, deleted_at FROM articles WHERE slug = ? LIMIT 1",
        [slug],
      );
      const r = rows[0];
      return !r || r.deleted_at !== null || r.published_at === null;
    }
  } catch {
    return false;
  }
  return false;
}

const poolQuery: ProxyQuery = async (sql, args) =>
  (await getPool().query<RowDataPacket[]>(sql, args))[0];

export async function proxy(
  request: NextRequest,
  deps: { query?: ProxyQuery } = {},
) {
  const legacy = legacyExploreRedirect(request);
  if (legacy) return legacy;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kb-path", request.nextUrl.pathname);
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);
  let seriesSlug = segments[2];
  try {
    seriesSlug = decodeURIComponent(seriesSlug ?? "");
  } catch {
    // Malformed encoding cannot name a registered series.
  }
  const [missingSeries, missingDetail] = await Promise.all([
    !UPCOMING.explore && segments.length === 3 &&
      segments[0] === "explore" && segments[1] === "series" &&
      !findLearnSeries(seriesSlug),
    /* request.cookies is a plain map in unit tests; has() mirrors the
       real API. */
    detailLooksMissing(
      segments,
      request.cookies?.has?.("kb_session") ?? false,
      deps.query ?? poolQuery,
    ),
  ]);
  // The page still calls notFound(); its loading boundary must not commit a 200 first.
  const response = NextResponse.next({
    request: { headers: requestHeaders },
    status: missingSeries || missingDetail ? 404 : 200,
  });
  const src = pathname === "/awesome" ? "awesome" : pathname === "/works" ? "works" : null;
  if (src) {
    /* Session cookie (no maxAge): "back" is the current visit's
       navigation context, not a lasting preference — a 30-day memory
       would send someone arriving from an external link back to a list
       they browsed days ago. */
    response.cookies.set("kb-works-src", src, {
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/community/:path*",
    "/explore/:path*",
    "/works/:path*",
    "/awesome/:path*",
    "/blog/:path*",
    "/learn/:path*",
    "/usage/:path*",
    "/u/:path*",
    "/settings/:path*",
    "/demo-night/:path*",
    "/admin/:path*",
    /* Single-level (app) pages need rail dispatch too: a missing
       matcher entry leaves RailGate hiding the rail with
       visibility:hidden (the trap explore hit before). */
    "/about/:path*",
    "/login/:path*",
  ],
};
