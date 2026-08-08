import { getSessionUser } from "@/src/lib/auth/session";
import { decideDeviceAuthorization } from "@/src/lib/usage/device";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";
import { consumeUsageRateLimit } from "@/src/lib/usage/rate-limit";
import { parseUsageSettings } from "@/src/lib/usage/settings";
import {
  readUsageJson,
  usageErrorResponse,
  UsageRequestError,
} from "@/src/lib/usage/validation";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      throw new UsageRequestError("invalid_origin", "Cross-origin approval is not allowed.", 403);
    }
    const user = await getSessionUser();
    if (!user) {
      throw new UsageRequestError("login_required", "Sign in before approving a device.", 401);
    }
    const allowed = await consumeUsageRateLimit({
      scope: "device-code-approve",
      identity: String(user.id),
      limit: 12,
      windowSeconds: 10 * 60,
    });
    if (!allowed) {
      throw new UsageRequestError("rate_limited", "Too many code attempts.", 429);
    }
    const raw = await readUsageJson(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new UsageRequestError("invalid_payload", "Request body must be an object.");
    }
    const body = raw as Record<string, unknown>;
    if (body.action !== "approve" && body.action !== "deny") {
      throw new UsageRequestError("invalid_payload", "action must be approve or deny.");
    }
    const settings = body.settings === undefined ? undefined : parseUsageSettings(body.settings);
    if (body.settings !== undefined && !settings) {
      throw new UsageRequestError("invalid_settings", "Usage privacy settings are invalid.");
    }
    const result = await decideDeviceAuthorization({
      userId: user.id,
      userCode: String(body.userCode ?? ""),
      action: body.action,
      deviceName: typeof body.deviceName === "string" ? body.deviceName : undefined,
      settings: settings ?? undefined,
    });
    const statuses: Record<typeof result, number> = {
      approved: 200,
      denied: 200,
      expired: 410,
      not_found: 404,
      unavailable: 409,
    };
    return noStoreJson({ ok: result === "approved" || result === "denied", status: result }, {
      status: statuses[result],
    });
  } catch (error) {
    return usageErrorResponse(error);
  }
}
