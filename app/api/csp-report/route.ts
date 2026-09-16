/* POST /api/csp-report — Content-Security-Policy-Report-Only target.
   Accepts the legacy application/csp-report body and the Reporting API
   application/reports+json envelope (array); stores one error_events
   row with source='csp'. Browsers fire these without an Origin header,
   so unlike /api/error there is no same-origin gate — a coarse IP rate
   limit plus the content-type allowlist stand in for it. Quiet 204 on
   everything else: the browser ignores the response, and we never echo
   report content back. */
import { insertErrorEvent, parseCspReport, ERROR_BODY_MAX_BYTES } from "@/src/lib/error-report";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSP_CONTENT_TYPES = ["application/csp-report", "application/reports+json"];

function empty(status = 204): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
  if (!CSP_CONTENT_TYPES.includes(contentType)) return empty();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > ERROR_BODY_MAX_BYTES) return empty(413);

  try {
    const allowed = await consumeUsageRateLimit({
      scope: "csp-report",
      identity: requestIdentity(request),
      limit: 60,
      windowSeconds: 10 * 60,
    });
    if (!allowed) return empty();
  } catch {
    /* Fail open — reports are advisory, never worth a 5xx. */
  }

  let input: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > ERROR_BODY_MAX_BYTES) return empty(413);
    input = JSON.parse(text);
  } catch {
    return empty();
  }
  const row = parseCspReport(input);
  if (!row) return empty();
  try {
    await insertErrorEvent(row, { userAgent: request.headers.get("user-agent") ?? "" });
  } catch (error) {
    console.error("csp report insert failed", error);
  }
  return empty();
}
