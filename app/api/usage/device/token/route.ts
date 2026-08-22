import { exchangeDeviceCode } from "@/src/lib/usage/device";
import { noStoreJson } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";
import {
  readUsageJson,
  usageErrorResponse,
  UsageRequestError,
} from "@/src/lib/usage/validation";

export async function POST(request: Request) {
  try {
    /* The IP tier comes first: the deviceCode tier below keys on a
       request-body string, so arbitrary strings could insert unbounded
       usage_rate_limits rows (nothing cleaned them); the IP tier
       converges row count per source IP, and rejected requests never
       reach the deviceCode tier (inserting nothing). */
    const ipAllowed = await consumeUsageRateLimit({
      scope: "device-code-token-ip",
      identity: requestIdentity(request),
      limit: 300,
      windowSeconds: 10 * 60,
    });
    if (!ipAllowed) {
      throw new UsageRequestError("rate_limited", "Too many token polling requests.", 429);
    }
    const raw = await readUsageJson(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new UsageRequestError("invalid_payload", "Request body must be an object.");
    }
    const deviceCode = String((raw as Record<string, unknown>).deviceCode ?? "");
    const allowed = await consumeUsageRateLimit({
      scope: "device-code-token",
      identity: deviceCode || "invalid",
      limit: 120,
      windowSeconds: 10 * 60,
    });
    if (!allowed) {
      throw new UsageRequestError("rate_limited", "Too many token polling requests.", 429);
    }
    const result = await exchangeDeviceCode(deviceCode);
    if (result.status === "approved") {
      return noStoreJson({
        apiKey: result.apiKey,
        deviceId: result.deviceId,
        tokenType: "Bearer",
      });
    }
    return noStoreJson({
      error: result.status,
      ...(result.status === "authorization_pending" || result.status === "slow_down"
        ? { interval: result.interval }
        : {}),
    });
  } catch (error) {
    return usageErrorResponse(error);
  }
}

