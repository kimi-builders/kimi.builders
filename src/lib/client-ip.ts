/* Client IP extraction shared by rate limiting and anonymous analytics.
   Trust order, first hit wins:
   1. cf-connecting-ip — authoritatively overwritten by the Cloudflare edge,
      but only trustworthy if the origin accepts traffic from CF ranges alone;
   2. x-real-ip — set explicitly by the reverse proxy;
   3. rightmost X-Forwarded-For segment — appended by our own proxy hop
      (Caddy), so the client cannot forge it. Behind CF this is an edge IP:
      coarser (shared by many visitors), but never fake — prefer coarse.
   Returns null on direct local access; callers fall back to "unknown". */
export function trustedClientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const rightmost = headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return rightmost || null;
}
