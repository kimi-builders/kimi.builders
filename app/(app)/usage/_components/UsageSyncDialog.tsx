"use client";

/* 「同步数据」弹窗(2026-08-14):已同步用户的日常入口——单次同步 / 后台服务
   四条管理命令 / 连接新设备。连接和上传是两个明确步骤。
   分工:sync/daemon 命令由本文件的 PKG 拼接;dashboard/init 与口径文案走
   src/lib/usage/device-onboarding.ts(单一事实源)。
   复制按钮复用 CopyUsageCommandButton。 */
import { useRef } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  USAGE_DASHBOARD_COMMAND,
  USAGE_INIT_COMMAND,
  usageDashboardConnectionGuide,
  usageInitMeaning,
} from "@/src/lib/usage/device-onboarding";
import CopyUsageCommandButton from "./CopyUsageCommandButton";

const PKG = "npx @kimi.builders/usage@latest";

function CommandRow({
  label,
  command,
  zh,
}: {
  label: string;
  command: string;
  zh: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 font-mono text-xs text-grey">{label}</span>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-line bg-bg">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-xs text-paper">
          {command}
        </code>
        <CopyUsageCommandButton command={command} zh={zh} />
      </div>
    </div>
  );
}

export default function UsageSyncDialog({ zh }: { zh: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line px-4 font-mono text-xs text-grey transition-colors hover:border-ui-blue hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto"
      >
        <RefreshCw size={14} aria-hidden="true" />
        {zh ? "同步数据" : "Sync data"}
      </button>
      <dialog
        ref={dialogRef}
        aria-label={zh ? "同步数据" : "Sync data"}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[86vh] w-[min(94vw,34rem)] overflow-clip rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75"
      >
        <div className="flex items-center justify-between border-b border-line bg-card px-5 py-4">
          <h2 className="font-mono text-sm font-semibold tracking-[0.06em]">
            {zh ? "同步数据" : "Sync data"}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={zh ? "关闭" : "Close"}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-grey transition-colors hover:bg-moon hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={17} />
          </button>
        </div>
        <div className="max-h-[calc(86vh-64px)] space-y-5 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="font-mono text-xs tracking-[0.08em] text-grey">
              {zh ? "单次同步" : "ONE-TIME SYNC"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-grey">
              {zh
                ? "手动执行一次;增量 checkpoint,重复运行不会重复计数。"
                : "Run once manually. Incremental checkpoints — re-running never double-counts."}
            </p>
            <div className="mt-2">
              <CommandRow label={zh ? "同步" : "Sync"} command={`${PKG} sync`} zh={zh} />
            </div>
          </section>

          <section>
            <h3 className="font-mono text-xs tracking-[0.08em] text-grey">
              {zh ? "持续同步(后台服务)" : "CONTINUOUS (BACKGROUND DAEMON)"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-grey">
              {zh
                ? "以当前用户身份运行,不需要管理员权限;设备休眠或离线时不工作。升级 Collector 后执行一次「重启」。"
                : "Runs as your user, no admin needed; pauses when the device sleeps or is offline. Restart once after upgrading the Collector."}
            </p>
            <div className="mt-2 space-y-2">
              <CommandRow label={zh ? "安装" : "Install"} command={`${PKG} daemon install`} zh={zh} />
              <CommandRow label={zh ? "状态" : "Status"} command={`${PKG} daemon status`} zh={zh} />
              <CommandRow label={zh ? "重启" : "Restart"} command={`${PKG} daemon restart`} zh={zh} />
              <CommandRow label={zh ? "卸载" : "Remove"} command={`${PKG} daemon uninstall`} zh={zh} />
            </div>
          </section>

          <section className="border-t border-line pt-4">
            <h3 className="font-mono text-xs tracking-[0.08em] text-grey">
              {zh ? "连接新设备" : "CONNECT A NEW DEVICE"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-grey">
              {usageDashboardConnectionGuide(zh)}
            </p>
            <div className="mt-2 space-y-2">
              <CommandRow label={zh ? "看板" : "UI"} command={USAGE_DASHBOARD_COMMAND} zh={zh} />
              <CommandRow label={zh ? "终端" : "CLI"} command={USAGE_INIT_COMMAND} zh={zh} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-grey">
              {usageInitMeaning(zh)} {zh
                ? "设备 Key 可随时在“设备”中撤销。"
                : "Revoke the device key anytime under Devices."}
            </p>
          </section>
        </div>
      </dialog>
    </>
  );
}
