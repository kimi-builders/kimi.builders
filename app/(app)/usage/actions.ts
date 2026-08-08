"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  decideDeviceAuthorization,
  deleteAllUsage,
  revokeUsageDevice,
} from "@/src/lib/usage/device";
import { getUsageSettings, updateUsageSettings } from "@/src/lib/usage/settings";

export interface DeviceDecisionState {
  status?: "approved" | "denied" | "expired" | "not_found" | "unavailable";
  error?: string;
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

export async function updateUsageSettingsAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const current = await getUsageSettings(user.id);
  await updateUsageSettings(user.id, {
    ...current,
    uploadProject: formData.get("upload_project") === "1",
  });
  revalidatePath("/usage");
}

export async function revokeUsageDeviceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await revokeUsageDevice(
    user.id,
    String(formData.get("device_id") ?? ""),
    formData.get("delete_data") === "1",
  );
  revalidatePath("/usage");
}

export async function deleteAllUsageAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user || formData.get("confirmation") !== "DELETE") return;
  await deleteAllUsage(user.id);
  revalidatePath("/usage");
}

