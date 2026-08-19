"use client";

import { useId, useRef } from "react";
import { CircleHelp, ShieldCheck, X } from "lucide-react";

/* 页头「隐私与数据边界」说明弹窗:原页头常驻副标题(Kimi-first,只接收 token、
   时间与计数…)收进此处,页头只留问号图标触发器;结构照 UsageMethodologyDialog
   (原生 <dialog> + showModal,点背景关闭,Esc 走原生)。 */
export default function UsagePrivacyDialog({ zh }: { zh: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `usage-privacy-${useId().replaceAll(":", "")}`;
  const title = zh ? "隐私与数据边界" : "Privacy & data boundaries";
  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={title}
        aria-haspopup="dialog"
        data-tip={title}
        className="inline-flex size-7 shrink-0 items-center justify-center text-grey/70 hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        <CircleHelp size={12} />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[86vh] w-[min(94vw,40rem)] overflow-hidden rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-card px-5 py-4">
          <div>
            <h2 id={titleId} className="font-mono text-sm font-semibold tracking-[0.06em]">
              {title}
            </h2>
            <p className="mt-1 text-[11px] text-grey">
              {zh ? "默认私有 · 只上传统计字段" : "Private by default · metrics only"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={zh ? "关闭" : "Close"}
            className="flex size-11 shrink-0 items-center justify-center text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={17} />
          </button>
        </div>
        <div className="max-h-[calc(86vh-66px)] overflow-y-auto px-5 py-5 text-xs leading-relaxed text-grey sm:px-6">
          <p>
            {zh
              ? "Kimi-first，多 Agent 兼容。这里只接收 token、时间与计数，不接收对话内容、完整路径或供应商凭据。"
              : "Kimi-first and multi-agent ready. Only token, timing, and count metrics are accepted—never conversations, full paths, or provider credentials."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border-l-2 border-status-ok pl-3">
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-paper">
                <ShieldCheck size={12} className="text-status-ok-fg" aria-hidden="true" />
                {zh ? "接收" : "COLLECTED"}
              </div>
              <p className="mt-1.5">
                {zh
                  ? "token 各分类用量、时间与时长、请求/会话/消息等计数，以及 Agent、模型、设备标识——均为聚合统计。"
                  : "Token usage by category, timing and durations, request/session/message counts, plus agent, model, and device identifiers—all aggregate statistics."}
              </p>
            </div>
            <div className="border-l-2 border-status-danger pl-3">
              <div className="font-mono text-[11px] text-paper">{zh ? "不接收" : "NEVER COLLECTED"}</div>
              <p className="mt-1.5">
                {zh
                  ? "对话内容、完整路径、供应商凭据。数据由本机 CLI 主动同步，站点不会主动读取本地日志。"
                  : "Conversations, full paths, or provider credentials. Data is pushed by the local CLI; the site never reads local logs on its own."}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[11px]">
            {zh
              ? "项目名默认不上传；需要按项目拆分时可在隐私设置中开启。"
              : "Project names are not uploaded by default; enable them in privacy settings to split by project."}
          </p>
        </div>
      </dialog>
    </>
  );
}
