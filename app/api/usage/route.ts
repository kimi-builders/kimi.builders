import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import { PUBLIC_USAGE_LEADERBOARD_CACHE_TAG } from "@/src/lib/cache-tags";
import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import { deleteAllUsage } from "@/src/lib/usage/device";
import { parseUsageFilters } from "@/src/lib/usage/filters";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";
import { getUsageOverview } from "@/src/lib/usage/query";
import { getUsageSettings } from "@/src/lib/usage/settings";

/* GET /api/usage — 看板聚合查询。
   鉴权:站点会话,或 Bearer kbu_ Key(read scope)。只返回调用者本人的数据。
   参数:range=7d|30d|90d(兼容 days=N)、from/to=YYYY-MM-DD(自定义,≤366 天)、
   sources/models/projects/devices=逗号分隔、metric=tokens|cost|duration、
   page/ps、tz=本地相对 UTC 的分钟偏移(默认 0)。
   响应 no-store:私人用量不进入任何共享缓存。 */
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
