import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import { revokeUsageDeviceById } from "@/src/lib/usage/device";
import { noStoreJson } from "@/src/lib/usage/http";
import { usageErrorResponse } from "@/src/lib/usage/validation";
import { getUsageAccountIdentity } from "@/src/lib/usage/account";

export async function GET(request: Request) {
  try {
    const principal = await authenticateUsageRequest(request, "settings");
    if (!principal) return usageUnauthorized();
    const account = await getUsageAccountIdentity(principal.userId);
    return noStoreJson({ account, deviceId: principal.devicePublicId });
  } catch (error) {
    return usageErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authenticateUsageRequest(request, "delete");
    if (!principal) return usageUnauthorized();
    const revoked = await revokeUsageDeviceById(principal.userId, principal.deviceId);
    return noStoreJson(
      { ok: revoked, revoked, dataDeleted: false, scope: "current_device" },
      { status: revoked ? 200 : 404 },
    );
  } catch (error) {
    return usageErrorResponse(error);
  }
}
