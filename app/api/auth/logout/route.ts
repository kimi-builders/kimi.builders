/* Logout: POST /api/auth/logout — clears the session cookie and returns
   to the home page (canonical origin; behind the proxy req.url is an
   internal address). POST-only: logout is a write — a GET link would be
   set off by prefetchers, crawlers, or cross-site <img>; the form lives
   in AuthChip, and the 303 redirect lets browsers follow up after the
   POST. */
import { NextRequest, NextResponse } from "next/server";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { isSameOrigin } from "@/src/lib/usage/http";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return Response.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }
  const res = NextResponse.redirect(canonicalOrigin(req) + "/", 303);
  res.cookies.delete("kb_session");
  return res;
}
