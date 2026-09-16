/* Security headers as pure builders (unit-testable): the CSP is
   Report-Only on purpose — the site ships inline styles/scripts in a
   few legitimate places (OG image routes, email-adjacent templates),
   so enforcement waits until real reports prove the policy complete.
   The img-src includes the R2 public origin derived from the env so
   media embeds keep working across environments. HSTS stays
   conservative (no subdomains/preload) because Cloudflare fronts the
   origin and other services may live on subdomains. */

export const CSP_REPORT_URI = "/api/csp-report";

export interface CspOptions {
  /* Extra origins for img-src, e.g. the R2 public base. */
  imageOrigins?: string[];
}

export function buildCspReportOnly(options: CspOptions = {}): string {
  const extraImages = (options.imageOrigins ?? [])
    .map((o) => o.replace(/\/+$/, ""))
    .filter((o) => o.length > 0);
  const imgSrc = ["'self'", "data:", "https:", ...extraImages].join(" ");
  return [
    "default-src 'self'",
    /* Next.js needs inline scripts for hydration bootstrap. */
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src https://player.bilibili.com https://www.youtube-nocookie.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `report-uri ${CSP_REPORT_URI}`,
  ].join("; ");
}

/* 180 days, no includeSubDomains, no preload — a rollback path stays
   available if TLS termination assumptions change. */
export const HSTS_HEADER =
  "max-age=15552000";

export function securityHeaders(env: {
  r2PublicBaseUrl?: string;
} = {}): { csp: string; hsts: string } {
  return {
    csp: buildCspReportOnly(
      env.r2PublicBaseUrl ? { imageOrigins: [env.r2PublicBaseUrl] } : {},
    ),
    hsts: HSTS_HEADER,
  };
}
