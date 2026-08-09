"use client";

import { useRef, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { deleteDeviceDataAction } from "../actions";

interface DeleteDeviceDataFormProps {
  deviceId: string;
  deviceName: string;
  zh: boolean;
}

export default function DeleteDeviceDataForm({
  deviceId,
  deviceName,
  zh,
}: DeleteDeviceDataFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      await deleteDeviceDataAction(formData);
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex items-center gap-1 font-mono text-[9px] text-grey hover:text-red-400"
      >
        <Trash2 size={11} />
        {zh ? "删除数据" : "Delete data"}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`delete-device-data-${deviceId}`}
        aria-describedby={`delete-device-data-description-${deviceId}`}
        className="fixed inset-0 m-auto w-[min(92vw,32rem)] border border-line bg-card p-0 text-paper shadow-2xl backdrop:bg-black/75"
      >
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3
                id={`delete-device-data-${deviceId}`}
                className="font-mono text-xs font-semibold tracking-[0.08em]"
              >
                {zh ? `删除「${deviceName}」的用量数据？` : `Delete usage from “${deviceName}”?`}
              </h3>
              <p
                id={`delete-device-data-description-${deviceId}`}
                className="mt-2 text-xs leading-relaxed text-grey"
              >
                {zh
                  ? "只删除站点上的用量事实；设备授权会保留。这项操作不能在站点内撤销。"
                  : "This removes usage facts from the site but keeps the device authorized. It cannot be undone on the site."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={zh ? "关闭" : "Close"}
              className="shrink-0 text-grey hover:text-paper"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="border border-amber-400/30 bg-amber-400/5 p-3 text-[11px] leading-relaxed text-grey">
            <p className="text-amber-300">
              {zh
                ? "Collector 的本地 checkpoint 不会自动回退，因此下次同步不会自动恢复被删历史。"
                : "The Collector checkpoint does not rewind, so the next sync will not automatically restore deleted history."}
            </p>
            <p className="mt-2">
              {zh
                ? "如需恢复 Collector 本地仍能读取的历史，请在这台设备执行："
                : "To restore history still available locally, run on this device:"}
            </p>
            <code className="mt-1 block whitespace-pre-wrap font-mono text-[10px] text-paper">
              npx @kimi-builders/usage reset --local{"\n"}npx @kimi-builders/usage sync
            </code>
          </div>
          <form action={submit} className="mt-4 flex justify-end gap-2">
            <input type="hidden" name="device_id" value={deviceId} />
            <input type="hidden" name="confirm_device_data" value={`DELETE:${deviceId}`} />
            <button
              type="button"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
              className="border border-line px-3 py-2 font-mono text-[10px] text-grey hover:text-paper disabled:opacity-50"
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="border border-red-400/50 px-3 py-2 font-mono text-[10px] text-red-300 hover:bg-red-400/10 disabled:cursor-wait disabled:opacity-50"
            >
              {pending
                ? zh
                  ? "删除中…"
                  : "Deleting…"
                : zh
                  ? "确认删除"
                  : "Delete data"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
