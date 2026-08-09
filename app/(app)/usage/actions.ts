"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  decideDeviceAuthorization,
  deleteAllUsage,
  deleteUsageForDeviceByPublicId,
  revokeUsageDevice,
} from "@/src/lib/usage/device";
import { captureUsageOperation } from "@/src/lib/usage/observability";
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
      });
    },
    { slowMs: 750 },
  );
  if (!operation.ok) {
    return { ok: false, code: "failed", reference: operation.reference };
  }
  revalidatePath("/usage");
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
  revalidatePath("/usage");
  return { ok: true, affectedRows: operation.value };
}
