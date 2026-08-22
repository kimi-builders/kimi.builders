import {
  BEACON_EVENTS,
  isAnalyticsBot,
  parseAnalyticsEventPayload,
  trackEvent,
  viewerHash,
  type AnalyticsEvent,
} from "@/src/lib/analytics";
import { readAnalyticsJson } from "@/src/lib/analytics-request";
import { isSameOrigin } from "@/src/lib/usage/http";
import { consumeUsageRateLimit } from "@/src/lib/usage/rate-limit";

const BEACON_EVENT_SET = new Set<AnalyticsEvent>(BEACON_EVENTS);

function empty(status = 204): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/* Browser beacon entry: accepts only the three taxonomy events marked
   as beacons. IP/UA feed the per-day HMAC and rate limiting only — never
   stored raw; no URL, referrer, or user_id fields are accepted. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return empty(403);
  if (isAnalyticsBot(request.headers.get("user-agent"))) return empty();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return empty(400);
  }

  /* Consume quota before reading the body: invalid tiny payloads still
     cost quota, and chunked large ones stop at 2 KiB. */
  try {
    const viewer = viewerHash(request);
    const allowed = await consumeUsageRateLimit({
      scope: "analytics-event",
      identity: viewer,
      limit: 60,
      windowSeconds: 10 * 60,
    });
    if (!allowed) return empty();
  } catch (error) {
    console.error("analytics beacon rate limit failed", error);
    return empty();
  }

  let input: unknown;
  try {
    input = await readAnalyticsJson(request);
  } catch {
    return empty(400);
  }
  const payload = parseAnalyticsEventPayload(input);
  if (!payload || !BEACON_EVENT_SET.has(payload.event)) return empty(400);

  try {
    trackEvent(
      payload.event,
      { kind: payload.target_kind, id: payload.target_id },
      { headers: request },
      payload.meta ?? undefined,
    );
  } catch (error) {
    /* Analytics must never affect browsing; failures return silently
       with only a generic server-side error log. */
    console.error("analytics beacon processing failed", error);
  }
  return empty();
}
