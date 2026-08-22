"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import { PUBLIC_USAGE_LEADERBOARD_CACHE_TAG } from "@/src/lib/cache-tags";
import {
  decideDeviceAuthorization,
  deleteAllUsage,
  deleteUsageForDeviceByPublicId,
  revokeUsageDevice,
} from "@/src/lib/usage/device";
import { captureUsageOperation } from "@/src/lib/usage/observability";
import { consumeUsageRateLimit } from "@/src/lib/usage/rate-limit";
import { getUsageSettings, updateUsageSettings } from "@/src/lib/usage/settings";

const USAGE_DEVICE_ID = /^udv_[A-Za-z0-9_-]{1,32}$/;
const USAGE_DEVICE_MANAGEMENT_MODES = new Set(["revoke", "delete-data", "revoke-delete"]);

export interface DeviceDecisionState {
  status?: "approved" | "denied" | "expired" | "not_found" | "unavailable";
  error?: string;
}

export interface UsageMutationResult {
  ok: boolean;
  code?: "login_required" | "invalid_request" | "not_found" | "failed";
  affectedRows?: number;
  reference?: string;
}

export async function decideUsageDeviceAction(
  _previous: DeviceDecisionState,
  formData: FormData,
): Promise<DeviceDecisionState> {
  const user = await getSessionUser();
  if (!user) return { error: "login_required" };
  /* user_code 枚举限流(20260822 P1-6):8 字符码可在线枚举,批准动作会把
     他人设备连进自己账号(用量数据流向攻击者)。按用户限速,与 JSON API
     路由(app/api/usage/device/approve)同档 12/10min,两条路都关死 */
  const allowed = await consumeUsageRateLimit({
    scope: "device-code-approve",
    identity: String(user.id),
    limit: 12,
    windowSeconds: 10 * 60,
  });
  if (!allowed) return { error: "rate_limited" };
  const action = formData.get("decision") === "deny" ? "deny" : "approve";
  const current = await getUsageSettings(user.id);
  const status = await decideDeviceAuthorization({
    userId: user.id,
    userCode: String(formData.get("user_code") ?? ""),
    action,
    deviceName: String(formData.get("device_name") ?? ""),
    settings:
      action === "approve"
        ? {
            ...current,
            uploadProject: formData.get("upload_project") === "1",
            uploadDeviceLabel: false,
            uploadQuotaSnapshots: false,
          }
        : undefined,
  });
  if (action === "approve" && status === "approved") {
    updateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG);
  }
  revalidatePath("/usage");
  revalidatePath("/usage/device");
  return { status };
}

export async function updateUsageSettingsAction(
  formData: FormData,
): Promise<UsageMutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: "login_required" };
  const operation = await captureUsageOperation(
    "usage.settings.update",
    async () => {
      const current = await getUsageSettings(user.id);
      await updateUsageSettings(user.id, {
        ...current,
        uploadProject: formData.get("upload_project") === "1",
        uploadDeviceLabel: formData.get("upload_device_label") === "1",
        showOnLeaderboard: formData.get("show_on_leaderboard") === "1",
      });
    },
    { slowMs: 750 },
  );
  if (!operation.ok) {
    return { ok: false, code: "failed", reference: operation.reference };
  }
  updateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG);
  /* 同一 usage_settings 行,多处挂载(用量/设置/个人主页)——全部重验证 */
  revalidatePath("/usage");
  revalidatePath("/settings");
  revalidatePath(`/u/${user.handle}`);
  return { ok: true };
}

export async function manageUsageDeviceAction(
  formData: FormData,
): Promise<UsageMutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: "login_required" };
  const deviceId = String(formData.get("device_id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (
    !USAGE_DEVICE_ID.test(deviceId) ||
    !USAGE_DEVICE_MANAGEMENT_MODES.has(mode) ||
    formData.get("confirmation") !== `MANAGE:${deviceId}:${mode}`
  ) {
    return { ok: false, code: "invalid_request" };
  }
  const operation = await captureUsageOperation(
    "usage.device.manage",
    async () => {
      if (mode === "delete-data") {
        const deleted = await deleteUsageForDeviceByPublicId(user.id, deviceId);
        return { found: deleted !== null, affectedRows: deleted ?? 0 };
      }
      const found = await revokeUsageDevice(user.id, deviceId, mode === "revoke-delete");
      return { found, affectedRows: 0 };
    },
    { slowMs: 1_000, metadata: { mode } },
  );
  if (!operation.ok) {
    return { ok: false, code: "failed", reference: operation.reference };
  }
  if (!operation.value.found) return { ok: false, code: "not_found" };
  if (mode !== "revoke") updateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG);
  revalidatePath("/usage");
  return { ok: true, affectedRows: operation.value.affectedRows };
}

export async function deleteAllUsageAction(
  formData: FormData,
): Promise<UsageMutationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: "login_required" };
  if (formData.get("confirmation") !== "DELETE") {
    return { ok: false, code: "invalid_request" };
  }
  const operation = await captureUsageOperation(
    "usage.data.delete-all",
    () => deleteAllUsage(user.id),
    { slowMs: 1_500 },
  );
  if (!operation.ok) {
    return { ok: false, code: "failed", reference: operation.reference };
  }
  updateTag(PUBLIC_USAGE_LEADERBOARD_CACHE_TAG);
  revalidatePath("/usage");
  return { ok: true, affectedRows: operation.value };
}
