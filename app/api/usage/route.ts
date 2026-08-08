import { getSessionUser } from "@/src/lib/auth/session";
import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import { deleteAllUsage } from "@/src/lib/usage/device";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";
import { getUsageDashboard } from "@/src/lib/usage/query";

export async function GET(request: Request) {
  const user = await getSessionUser();
  const principal = user ? null : await authenticateUsageRequest(request, "read");
  const userId = user?.id ?? principal?.userId;
  if (!userId) return usageUnauthorized();
  const requested = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isFinite(requested) ? requested : 30;
  return noStoreJson({ ok: true, data: await getUsageDashboard(userId, days) });
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
  return noStoreJson({ ok: true, deleted });
}

