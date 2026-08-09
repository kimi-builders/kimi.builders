import { USAGE_INGEST_PROTOCOL_VERSION } from "@/src/lib/usage-contract";
import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import { deleteUsageForDevice } from "@/src/lib/usage/device";
import { ingestUsage } from "@/src/lib/usage/ingest";
import { noStoreJson } from "@/src/lib/usage/http";
import { getUsageSettings } from "@/src/lib/usage/settings";
import {
  readUsageJson,
  usageErrorResponse,
  validateUsageIngest,
} from "@/src/lib/usage/validation";

export async function POST(request: Request) {
  try {
    const principal = await authenticateUsageRequest(request, "ingest");
    if (!principal) return usageUnauthorized();
    const settings = await getUsageSettings(principal.userId);
    const payload = validateUsageIngest(await readUsageJson(request), settings);
    const result = await ingestUsage(principal, payload);
    const { protectedBuckets, ...ingested } = result;
    return noStoreJson({
      ok: true,
      protocolVersion: USAGE_INGEST_PROTOCOL_VERSION,
      ingested,
      protected: { buckets: protectedBuckets },
    });
  } catch (error) {
    return usageErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await authenticateUsageRequest(request, "delete");
    if (!principal) return usageUnauthorized();
    const deleted = await deleteUsageForDevice(principal.userId, principal.deviceId);
    return noStoreJson({ ok: true, deleted, scope: "current_device" });
  } catch (error) {
    return usageErrorResponse(error);
  }
}
