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

/* 浏览器计数入口:只接收 taxonomy 中标记为 beacon 的三种事件。
   IP/UA 只参与当日 HMAC 与限速,不存原文;不接收 URL、referrer、user_id 等字段。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return empty(403);
  if (isAnalyticsBot(request.headers.get("user-agent"))) return empty();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return empty(400);
  }

  /* 扣配额后再读取 body:非法小包也占额度,chunked 大包会在 2 KiB 处停止。 */
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
    /* 分析不可影响浏览动作;失败静默返回,服务端只记通用错误。 */
    console.error("analytics beacon processing failed", error);
  }
  return empty();
}
