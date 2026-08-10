"use client";

import { useRef } from "react";
import { Download, FileJson2, Sheet, ShieldCheck, X } from "lucide-react";
import {
  USAGE_EXPORT_MAX_ROWS,
  USAGE_JSON_EXPORT_ROW_CAP,
} from "@/src/lib/usage/filters";

export default function UsageExportDialog({
  csvHref,
  jsonHref,
  filteredRecordCount,
  rangeLabel,
  zh,
}: {
  csvHref: string;
  jsonHref: string;
  filteredRecordCount: number;
  rangeLabel: string;
  zh: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const csvRows = Math.min(filteredRecordCount, USAGE_EXPORT_MAX_ROWS);
  const csvTruncated = filteredRecordCount > USAGE_EXPORT_MAX_ROWS;
  const locale = zh ? "zh-CN" : "en-US";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:w-auto"
      >
        <Download size={13} aria-hidden="true" /> {zh ? "导出" : "Export"}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="usage-export-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[86vh] w-[min(94vw,38rem)] overflow-hidden rounded-2xl border border-line bg-bg p-0 text-paper shadow-2xl backdrop:bg-black/75"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-moon px-5 py-4">
          <div>
            <h3 id="usage-export-title" className="font-mono text-sm font-semibold">
              {zh ? "导出私人用量数据" : "Export private usage data"}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-grey">
              {zh
                ? "选择适合分析或备份的格式。下载内容只属于当前登录用户。"
                : "Choose a format for analysis or backup. Downloads only contain the signed-in user’s data."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={zh ? "关闭" : "Close"}
            className="flex size-11 shrink-0 items-center justify-center text-grey hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[calc(86vh-76px)] space-y-3 overflow-y-auto px-5 py-4">
          <a
            href={csvHref}
            onClick={() => dialogRef.current?.close()}
            className="flex min-h-20 items-start gap-3 border border-line bg-card p-4 hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <Sheet size={19} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-paper">CSV</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-grey">
                {zh
                  ? `当前筛选（${rangeLabel}），导出 ${csvRows.toLocaleString(locale)} 条聚合明细${csvTruncated ? `；共 ${filteredRecordCount.toLocaleString(locale)} 条，已按 ${USAGE_EXPORT_MAX_ROWS.toLocaleString(locale)} 条上限截断` : ""}。`
                  : `Current filters (${rangeLabel}), exporting ${csvRows.toLocaleString(locale)} aggregate rows${csvTruncated ? `; ${filteredRecordCount.toLocaleString(locale)} available, truncated at ${USAGE_EXPORT_MAX_ROWS.toLocaleString(locale)}` : ""}.`}
              </span>
            </span>
          </a>
          <a
            href={jsonHref}
            onClick={() => dialogRef.current?.close()}
            className="flex min-h-20 items-start gap-3 border border-line bg-card p-4 hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <FileJson2 size={19} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-paper">JSON</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-grey">
                {zh
                  ? `全部历史原始事实，不受当前筛选影响；bucket 和 session 各最多 ${USAGE_JSON_EXPORT_ROW_CAP.toLocaleString(locale)} 条。文件内会写明总数、导出数和是否截断。`
                  : `All raw historical facts, independent of current filters; up to ${USAGE_JSON_EXPORT_ROW_CAP.toLocaleString(locale)} buckets and sessions each. The file declares totals, exported counts, and truncation.`}
              </span>
            </span>
          </a>
          <p className="flex items-start gap-2 border-t border-line pt-4 text-[11px] leading-relaxed text-grey">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
            {zh
              ? "不包含对话内容、完整路径、内部 hash、API Key 或设备授权材料。电子表格公式注入字符会自动转义。"
              : "Exports exclude conversations, full paths, internal hashes, API keys, and device authorization material. Spreadsheet formula prefixes are escaped."}
          </p>
        </div>
      </dialog>
    </>
  );
}
