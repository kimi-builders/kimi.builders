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

export function proxy(request: NextRequest) {
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
