"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/src/lib/toast";
import { updateUsageSettingsAction } from "../actions";

export default function UsagePrivacyForm({
  uploadProject,
  retentionDays,
  zh,
}: {
  uploadProject: boolean;
  retentionDays: number;
  zh: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(uploadProject);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const result = await updateUsageSettingsAction(formData);
        if (!result.ok) {
          const message = zh ? "保存失败，请稍后重试。" : "Save failed. Please try again.";
          setError(result.reference ? `${message} (${result.reference})` : message);
          return;
        }
        toast(zh ? "隐私设置已保存" : "Privacy settings saved");
        router.refresh();
      } catch {
        setError(zh ? "网络或服务器异常，请稍后重试。" : "Network or server error. Please try again.");
      }
    });
  }

  return (
    <form action={submit} aria-busy={pending} className="mt-4">
      <label className="flex min-h-14 cursor-pointer items-start justify-between gap-4 border-b border-line pb-4">
        <span>
          <span className="block text-sm text-paper">{zh ? "上传项目目录名" : "Upload project names"}</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-grey">
            {zh
              ? "仅 basename；关闭后 Collector 的 payload 中不会出现 project 字段。"
              : "Basename only; when off, project is absent from collector payloads."}
          </span>
        </span>
        <input
          type="checkbox"
          name="upload_project"
          value="1"
          checked={enabled}
          disabled={pending}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setError("");
          }}
          className="mt-1 size-5 shrink-0 accent-blue"
        />
      </label>
      {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-grey">
          {zh ? `保留 ${retentionDays} 天` : `${retentionDays}-day retention`}
        </span>
        <button
          disabled={pending}
          className="min-h-11 border border-line px-4 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-wait disabled:opacity-50"
        >
          {pending ? (zh ? "保存中…" : "Saving…") : (zh ? "保存" : "Save")}
        </button>
      </div>
    </form>
  );
}
