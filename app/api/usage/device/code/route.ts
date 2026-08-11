import { createDeviceAuthorization } from "@/src/lib/usage/device";
import { canonicalOrigin } from "@/src/lib/auth/origin";
import { noStoreJson } from "@/src/lib/usage/http";
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";
import {
  readUsageJson,
  usageErrorResponse,
  UsageRequestError,
} from "@/src/lib/usage/validation";

export async function POST(request: Request) {
  try {
    const allowed = await consumeUsageRateLimit({
      scope: "device-code-create",
      identity: requestIdentity(request),
      limit: 20,
      windowSeconds: 10 * 60,
    });
    if (!allowed) {
      throw new UsageRequestError("rate_limited", "Too many device authorization requests.", 429);
    }
    const body = await readUsageJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new UsageRequestError("invalid_payload", "Request body must be an object.");
    }
    const result = await createDeviceAuthorization(body as Record<string, unknown>);
    const origin = canonicalOrigin(request);
    const verificationUri = `${origin}/usage/device`;
    return noStoreJson(
      {
        ...result,
        verificationUri,
        verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(result.userCode)}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return usageErrorResponse(error);
  }
}

