import { getSessionUser } from "@/src/lib/auth/session";
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
  // dataOnly=1:只删除该设备的事实数据,保留授权;默认行为仍是撤销(可选连带删数据)。
  if (search.get("dataOnly") === "1") {
    const deleted = await deleteUsageForDeviceByPublicId(user.id, id);
    return noStoreJson(
      { ok: deleted !== null, revoked: false, dataDeleted: deleted !== null, deleted },
      { status: deleted === null ? 404 : 200 },
    );
  }
  const deleteData = search.get("deleteData") === "1";
  const revoked = await revokeUsageDevice(user.id, id, deleteData);
  return noStoreJson(
    { ok: revoked, revoked, dataDeleted: revoked && deleteData },
    { status: revoked ? 200 : 404 },
  );
}

