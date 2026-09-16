/* Security headers as pure builders (unit-testable): the CSP is
   Report-Only on purpose — the site ships inline styles/scripts in a
   few legitimate places (OG image routes, email-adjacent templates),
   so enforcement waits until real reports prove the policy complete.
   Images and curated deck embeds currently accept HTTPS origins at the
   product layer, so the report-only policy mirrors that contract until
   those fields gain a stricter host allowlist. HSTS stays conservative
   (no subdomains/preload) because Cloudflare fronts the origin and
   other services may live on subdomains. */

export const CSP_REPORT_URI = "/api/csp-report";

export function buildCspReportOnly(): string {
  return [
    "default-src 'self'",
    /* Next.js needs inline scripts for hydration bootstrap. */
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https:",
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

export function securityHeaders(): { csp: string; hsts: string } {
  return {
    csp: buildCspReportOnly(),
    hsts: HSTS_HEADER,
  };
}
