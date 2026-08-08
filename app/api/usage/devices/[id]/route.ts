import { getSessionUser } from "@/src/lib/auth/session";
import { revokeUsageDevice } from "@/src/lib/usage/device";
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
  const deleteData = new URL(request.url).searchParams.get("deleteData") === "1";
  const revoked = await revokeUsageDevice(user.id, id, deleteData);
  return noStoreJson(
    { ok: revoked, revoked, dataDeleted: revoked && deleteData },
    { status: revoked ? 200 : 404 },
  );
}

