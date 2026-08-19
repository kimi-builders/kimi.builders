"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2, X } from "lucide-react";
import { toast } from "@/src/lib/toast";
import { manageUsageDeviceAction } from "../actions";

type ManagementMode = "revoke" | "delete-data" | "revoke-delete";

interface DeviceManagementDialogProps {
  deviceId: string;
  deviceName: string;
  bucketCount: number;
  sessionCount: number;
  revoked: boolean;
  zh: boolean;
}

export default function DeviceManagementDialog({
  deviceId,
  deviceName,
  bucketCount,
  sessionCount,
  revoked,
  zh,
}: DeviceManagementDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [mode, setMode] = useState<ManagementMode>(revoked ? "delete-data" : "revoke");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const deletesData = mode === "delete-data" || mode === "revoke-delete";
  const locale = zh ? "zh-CN" : "en-US";

  function close() {
    if (pending) return;
    setError("");
    dialogRef.current?.close();
  }

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const result = await manageUsageDeviceAction(formData);
        if (!result.ok) {
          const message =
            result.code === "not_found"
              ? zh ? "设备不存在或已被移除。" : "The device no longer exists."
              : zh ? "操作失败，请稍后重试。" : "The operation failed. Please try again.";
          setError(result.reference ? `${message} (${result.reference})` : message);
          return;
        }
        const message = mode === "revoke"
          ? zh ? "设备 Key 已撤销" : "Device key revoked"
          : mode === "delete-data"
            ? zh ? `已删除 ${result.affectedRows ?? 0} 条远端事实` : `Deleted ${result.affectedRows ?? 0} remote facts`
            : zh ? "设备已撤销，远端数据已删除" : "Device revoked and remote data deleted";
        toast(message);
        dialogRef.current?.close();
        router.refresh();
      } catch {
        setError(zh ? "网络或服务器异常，请稍后重试。" : "Network or server error. Please try again.");
      }
    });
  }

  const choices: Array<{
    value: ManagementMode;
    title: string;
    description: string;
    disabled?: boolean;
  }> = [
    {
      value: "revoke",
      title: zh ? "仅撤销设备 Key" : "Revoke device key",
      description: zh
        ? "立即停止这台设备继续同步，保留站点上的历史数据。"
        : "Stop future syncs immediately and keep existing site history.",
      disabled: revoked,
    },
    {
      value: "delete-data",
      title: zh ? "仅删除远端数据" : "Delete remote data",
      description: zh
        ? "保留设备授权，只删除该设备已经上传的用量事实。"
        : "Keep the device authorized and remove only its uploaded usage facts.",
    },
    {
      value: "revoke-delete",
      title: zh ? "撤销并删除" : "Revoke and delete",
      description: zh
        ? "停止后续同步，同时删除该设备的远端用量事实。"
        : "Stop future syncs and remove this device’s remote usage facts.",
      disabled: revoked,
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-1.5 px-2 font-mono text-xs text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <Settings2 size={12} aria-hidden="true" />
        {zh ? "管理" : "Manage"}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`manage-device-${deviceId}`}
        aria-describedby={`manage-device-description-${deviceId}`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed inset-0 m-auto w-[min(94vw,36rem)] rounded-2xl border border-line bg-card p-0 text-paper shadow-2xl backdrop:bg-black/75"
      >
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id={`manage-device-${deviceId}`} className="truncate font-mono text-sm font-semibold">
                {zh ? `管理「${deviceName}」` : `Manage “${deviceName}”`}
              </h3>
              <p id={`manage-device-description-${deviceId}`} className="mt-2 text-xs leading-relaxed text-grey">
                {zh
                  ? `当前远端保存 ${bucketCount.toLocaleString(locale)} 个用量桶、${sessionCount.toLocaleString(locale)} 个会话。请选择本次操作。`
                  : `The site currently stores ${bucketCount.toLocaleString(locale)} usage buckets and ${sessionCount.toLocaleString(locale)} sessions for this device.`}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={close}
              aria-label={zh ? "关闭" : "Close"}
              className="flex size-11 shrink-0 items-center justify-center text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <form action={submit} aria-busy={pending} className="px-5 py-4">
          <input type="hidden" name="device_id" value={deviceId} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="confirmation" value={`MANAGE:${deviceId}:${mode}`} />
          <fieldset className="space-y-2">
            <legend className="sr-only">{zh ? "选择设备管理操作" : "Choose a device action"}</legend>
            {choices.map((choice) => (
              <label
                key={choice.value}
                className={`flex min-h-16 gap-3 border p-3 ${
                  choice.disabled
                    ? "cursor-not-allowed border-line opacity-45"
                    : mode === choice.value
                      ? "cursor-pointer border-blue bg-blue/5"
                      : "cursor-pointer border-line hover:border-grey"
                }`}
              >
                <input
                  type="radio"
                  name="mode_choice"
                  value={choice.value}
                  checked={mode === choice.value}
                  disabled={choice.disabled || pending}
                  onChange={() => {
                    setMode(choice.value);
                    setError("");
                  }}
                  className="mt-0.5 size-4 shrink-0 accent-blue"
                />
                <span>
                  <span className="block text-xs font-medium text-paper">{choice.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-grey">{choice.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {deletesData && (
            <div className="mt-4 border border-status-warn/30 bg-status-warn/5 p-3 text-xs leading-relaxed text-grey">
              <p className="text-status-warn-fg">
                {zh
                  ? "删除不能在站点内撤销，而且 Collector 的本地 checkpoint 不会自动回退。"
                  : "Deletion cannot be undone on the site, and the Collector checkpoint will not rewind automatically."}
              </p>
              <p className="mt-2">
                {zh ? "如需从本机历史恢复，删除后在该设备执行：" : "To restore locally available history later, run:"}
              </p>
              <code className="mt-1 block whitespace-pre-wrap font-mono text-xs text-paper">
                npx @kimi.builders/usage@latest reset --local{"\n"}npx @kimi.builders/usage@latest sync
              </code>
            </div>
          )}

          {error && <p role="alert" className="mt-3 text-xs text-status-danger-fg">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={close}
              className="min-h-11 rounded-lg border border-line px-4 font-mono text-xs text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={`min-h-11 rounded-lg border px-4 font-mono text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-wait disabled:opacity-50 ${
                deletesData
                  ? "border-status-danger/50 text-status-danger-fg hover:bg-status-danger/10"
                  : "border-status-warn/50 text-status-warn-fg hover:bg-status-warn/10"
              }`}
            >
              {pending ? (zh ? "处理中…" : "Working…") : (zh ? "确认操作" : "Confirm action")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
