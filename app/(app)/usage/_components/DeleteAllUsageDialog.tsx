"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { toast } from "@/src/lib/toast";
import { deleteAllUsageAction } from "../actions";

export default function DeleteAllUsageDialog({
  bucketCount,
  sessionCount,
  zh,
}: {
  bucketCount: number;
  sessionCount: number;
  zh: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const locale = zh ? "zh-CN" : "en-US";

  function close() {
    if (pending) return;
    setConfirmation("");
    setError("");
    dialogRef.current?.close();
  }

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const result = await deleteAllUsageAction(formData);
        if (!result.ok) {
          const message = zh ? "删除失败，请稍后重试。" : "Deletion failed. Please try again.";
          setError(result.reference ? `${message} (${result.reference})` : message);
          return;
        }
        toast(
          zh
            ? `已删除 ${result.affectedRows ?? 0} 条用量事实`
            : `Deleted ${result.affectedRows ?? 0} usage facts`,
        );
        setConfirmation("");
        setError("");
        dialogRef.current?.close();
        router.refresh();
      } catch {
        setError(zh ? "网络或服务器异常，请稍后重试。" : "Network or server error. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-status-danger/35 px-3 font-mono text-xs text-status-danger-fg hover:bg-status-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <Trash2 size={13} aria-hidden="true" />
        {zh ? "删除全部用量数据" : "Delete all usage data"}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-all-usage-title"
        aria-describedby="delete-all-usage-description"
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
            <div>
              <h3 id="delete-all-usage-title" className="font-mono text-sm font-semibold">
                {zh ? "删除全部用量数据？" : "Delete all usage data?"}
              </h3>
              <p id="delete-all-usage-description" className="mt-2 text-xs leading-relaxed text-grey">
                {zh
                  ? `将删除 ${bucketCount.toLocaleString(locale)} 个用量桶和 ${sessionCount.toLocaleString(locale)} 个会话；设备授权会保留。`
                  : `This removes ${bucketCount.toLocaleString(locale)} usage buckets and ${sessionCount.toLocaleString(locale)} sessions. Device authorizations remain.`}
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
          <div className="border border-status-warn/30 bg-status-warn/5 p-3 text-xs leading-relaxed text-grey">
            <p className="text-status-warn-fg">
              {zh
                ? "这项操作无法在站点内撤销。所有 Collector 的本地 checkpoint 都不会自动回退。"
                : "This cannot be undone on the site. Local checkpoints on every Collector will remain unchanged."}
            </p>
            <p className="mt-2">
              {zh
                ? "若要恢复某台设备仍保存在本机的历史，需要在该设备执行 reset --local 后重新同步。"
                : "To restore locally available history, run reset --local and sync again on each device."}
            </p>
          </div>
          <label className="mt-4 block text-xs text-grey" htmlFor="delete-all-usage-confirmation">
            {zh ? "输入 DELETE 以确认" : "Type DELETE to confirm"}
          </label>
          <input
            id="delete-all-usage-confirmation"
            name="confirmation"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setError("");
            }}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 min-h-11 w-full border border-line bg-bg px-3 font-mono text-sm text-paper outline-none focus:border-blue"
          />
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
              disabled={pending || confirmation !== "DELETE"}
              className="min-h-11 border border-status-danger/50 px-4 font-mono text-xs text-status-danger-fg hover:bg-status-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? (zh ? "删除中…" : "Deleting…") : (zh ? "永久删除" : "Delete permanently")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
