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

export function proxy(request: NextRequest) {
  const legacy = legacyExploreRedirect(request);
  if (legacy) return legacy;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kb-path", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const pathname = request.nextUrl.pathname;
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
