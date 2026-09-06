import { revalidateTag } from "next/cache";
import { PUBLIC_USAGE_LEADERBOARD_CACHE_TAG } from "@/src/lib/cache-tags";
import { USAGE_INGEST_PROTOCOL_VERSION } from "@/src/lib/usage-contract";
import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import { deleteUsageForDevice } from "@/src/lib/usage/device";
import { ingestUsage } from "@/src/lib/usage/ingest";
import { noStoreJson } from "@/src/lib/usage/http";
import { consumeUsageRateLimitResult } from "@/src/lib/usage/rate-limit";
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
    /* Authenticated devices stay bounded too: a leaked key must not mean
       unbounded bucket writes (payload caps bound each batch; this bounds
       the batch rate). Keyed by the key id, so client IP trust is not a
       dependency here. */
    const rate = await consumeUsageRateLimitResult({
      scope: "usage-ingest",
      identity: `key:${principal.keyId}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rate.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: {
            code: "rate_limited",
            message: "Ingest rate limit exceeded; slow down the sync loop.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    }
    const settings = await getUsageSettings(principal.userId);
    const payload = validateUsageIngest(await readUsageJson(request), settings);
    const result = await ingestUsage(principal, payload);
    const { protectedBuckets, ...ingested } = result;
    if (settings.showOnLeaderboard && ingested.buckets > 0) {
      revalidateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, "max");
    }
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
    revalidateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, { expire: 0 });
    return noStoreJson({ ok: true, deleted, scope: "current_device" });
  } catch (error) {
    return usageErrorResponse(error);
  }
}
