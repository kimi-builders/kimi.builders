import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import { PUBLIC_USAGE_LEADERBOARD_CACHE_TAG } from "@/src/lib/cache-tags";
import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import { deleteAllUsage } from "@/src/lib/usage/device";
import { parseUsageFilters } from "@/src/lib/usage/filters";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";
import { getUsageOverview } from "@/src/lib/usage/query";
import { getUsageSettings } from "@/src/lib/usage/settings";

/* GET /api/usage — dashboard aggregate query. Auth: a site session or a
   Bearer kbu_ key (read scope); only the caller's own data. Params:
   range=7d|30d|90d (days=N accepted), from/to=YYYY-MM-DD (custom, <=366
   days), sources/models/projects/devices=comma-separated,
   metric=tokens|cost|duration, page/ps, tz=minutes offset from UTC
   (default 0). Responses are no-store: private usage never enters a
   shared cache. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  const principal = user ? null : await authenticateUsageRequest(request, "read");
  const userId = user?.id ?? principal?.userId;
  if (!userId) return usageUnauthorized();
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const settings = await getUsageSettings(userId);
  const filters = parseUsageFilters(raw, {
    uploadProject: settings.uploadProject,
    tzOffsetMinutes: url.searchParams.get("tz"),
  });
  return noStoreJson({ ok: true, data: await getUsageOverview(userId, filters) });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) return usageUnauthorized();
  if (new URL(request.url).searchParams.get("confirm") !== "delete") {
    return noStoreJson({ ok: false, error: "confirmation_required" }, { status: 400 });
  }
  const deleted = await deleteAllUsage(user.id);
  revalidateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, { expire: 0 });
  return noStoreJson({ ok: true, deleted });
}
