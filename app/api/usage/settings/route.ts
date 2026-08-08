import { getSessionUser } from "@/src/lib/auth/session";
import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";
import {
  getUsageSettings,
  parseUsageSettings,
  updateUsageSettings,
} from "@/src/lib/usage/settings";
import {
  readUsageJson,
  usageErrorResponse,
  UsageRequestError,
} from "@/src/lib/usage/validation";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    const principal = user ? null : await authenticateUsageRequest(request, "settings");
    const userId = user?.id ?? principal?.userId;
    if (!userId) return usageUnauthorized();
    return noStoreJson(await getUsageSettings(userId));
  } catch (error) {
    return usageErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      throw new UsageRequestError("invalid_origin", "Cross-origin settings changes are not allowed.", 403);
    }
    const user = await getSessionUser();
    if (!user) return usageUnauthorized();
    const settings = parseUsageSettings(await readUsageJson(request));
    if (!settings) {
      throw new UsageRequestError("invalid_settings", "Usage privacy settings are invalid.");
    }
    await updateUsageSettings(user.id, settings);
    return noStoreJson({ ok: true, settings });
  } catch (error) {
    return usageErrorResponse(error);
  }
}

