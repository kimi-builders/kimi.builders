import { getSessionUser } from "@/src/lib/auth/session";
import { listUsageDevices } from "@/src/lib/usage/device";
import { noStoreJson } from "@/src/lib/usage/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return noStoreJson({ ok: false, error: "login_required" }, { status: 401 });
  const devices = await listUsageDevices(user.id);
  return noStoreJson({ ok: true, devices });
}

