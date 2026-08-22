import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import { PUBLIC_USAGE_LEADERBOARD_CACHE_TAG } from "@/src/lib/cache-tags";
import {
  deleteUsageForDeviceByPublicId,
  revokeUsageDevice,
} from "@/src/lib/usage/device";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) return noStoreJson({ ok: false, error: "login_required" }, { status: 401 });
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  // dataOnly=1: delete just this device's fact data, keep the
  // authorization; the default action is still revoke (optionally with
  // data).
  if (search.get("dataOnly") === "1") {
    const deleted = await deleteUsageForDeviceByPublicId(user.id, id);
    if (deleted !== null) {
      revalidateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, { expire: 0 });
    }
    return noStoreJson(
      { ok: deleted !== null, revoked: false, dataDeleted: deleted !== null, deleted },
      { status: deleted === null ? 404 : 200 },
    );
  }
  const deleteData = search.get("deleteData") === "1";
  const revoked = await revokeUsageDevice(user.id, id, deleteData);
  if (revoked && deleteData) {
    revalidateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG, { expire: 0 });
  }
  return noStoreJson(
    { ok: revoked, revoked, dataDeleted: revoked && deleteData },
    { status: revoked ? 200 : 404 },
  );
}
