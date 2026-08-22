/* The site's canonical origin. Production sits behind a Caddy proxy, so
   req.url's origin becomes an internal address (localhost:3210) —
   building OAuth redirect_uris, callback targets, or email links from it
   would poison them all; trusting the raw request origin invites
   Host-header injection. Always use NEXT_PUBLIC_SITE_URL (injected at
   build time, validated by the deploy workflow), falling back to the
   request origin in local dev when unset. */
export function canonicalOrigin(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
  ).replace(/\/+$/, "");
}
