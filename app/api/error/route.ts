/* POST /api/error — client-rendering error reports. Same-origin only,
   IP-rate-limited, body capped at 16 KiB. Validation outcomes answer a
   bare 204 (never leak why a report was dropped; an error reporter
   must not become a second error surface); only an oversized body is
   rejected with 413 so the sender can stop retrying it. Storage is
   capped + sanitized in src/lib/error-report.ts. */
import { insertErrorEvent, parseErrorReport, ERROR_BODY_MAX_BYTES } from "@/src/lib/error-report";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function empty(status = 204): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return empty();
  const contentType = (request.headers.get("content-type") ?? "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (contentType !== "application/json") return empty();
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > ERROR_BODY_MAX_BYTES) return empty(413);

  try {
    const allowed = await consumeUsageRateLimit({
      scope: "error-report",
      identity: requestIdentity(request),
      limit: 20,
      windowSeconds: 10 * 60,
    });
    if (!allowed) return empty();
  } catch {
    /* Rate-limit store unavailable: fail open — a lost insert is
       cheaper than losing the report entirely. */
  }

  let input: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > ERROR_BODY_MAX_BYTES) return empty(413);
    input = JSON.parse(text);
  } catch {
    return empty();
  }
  const row = parseErrorReport(
    (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>,
  );
  if (!row) return empty();

  try {
    await insertErrorEvent(row, { userAgent: request.headers.get("user-agent") ?? "" });
  } catch (error) {
    console.error("error report insert failed", error);
  }
  return empty();
}
