"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { updateUsageSettingsAction } from "../actions";

/* iOS 风格开关:sr-only checkbox + 轨道/滑块兄弟节点(peer-checked 驱动),
   语义仍是原生 checkbox,FormData/键盘行为不变。 */
function Switch({
  name,
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <span className="relative mt-0.5 inline-flex shrink-0">
      <input
        type="checkbox"
        name={name}
        value="1"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="block h-6 w-11 rounded-full bg-paper/15 transition-colors peer-checked:bg-blue peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue peer-disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
      />
    </span>
  );
}

export default function UsagePrivacyForm({
  uploadProject,
  showOnLeaderboard,
  retentionDays,
  zh,
}: {
  uploadProject: boolean;
  showOnLeaderboard: boolean;
  retentionDays: number;
  zh: boolean;
}) {
  const router = useRouter();
  const locale: Locale = zh ? "zh" : "en";
  const [enabled, setEnabled] = useState(uploadProject);
  const [listed, setListed] = useState(showOnLeaderboard);
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

  const rowCls =
    "flex cursor-pointer items-start justify-between gap-4 border-b border-line py-4 first:pt-0";
  const rowTitle = "block text-[13px] font-medium text-paper";
  const rowHint = "mt-1 block max-w-lg text-xs leading-relaxed text-grey";

  return (
    <form action={submit} aria-busy={pending}>
      <label className={rowCls}>
        <span>
          <span className={rowTitle}>{zh ? "上传项目目录名" : "Upload project names"}</span>
          <span className={rowHint}>
            {zh
              ? "仅 basename；关闭后 Collector 的 payload 中不会出现 project 字段。"
              : "Basename only; when off, project is absent from collector payloads."}
          </span>
        </span>
        <Switch
          name="upload_project"
          checked={enabled}
          disabled={pending}
          ariaLabel={zh ? "上传项目目录名" : "Upload project names"}
          onChange={(value) => {
            setEnabled(value);
            setError("");
          }}
        />
      </label>
      <label className={rowCls}>
        <span>
          <span className={rowTitle}>{t(locale, "lb.optin")}</span>
          <span className={rowHint}>
            {t(locale, "lb.optinHint")}
          </span>
        </span>
        <Switch
          name="show_on_leaderboard"
          checked={listed}
          disabled={pending}
          ariaLabel={t(locale, "lb.optin")}
          onChange={(value) => {
            setListed(value);
            setError("");
          }}
        />
      </label>
      {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-grey">
          {zh ? `保留 ${retentionDays} 天` : `${retentionDays}-day retention`}
        </span>
        <button
          disabled={pending}
          className="min-h-11 rounded-lg border border-line px-4 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:cursor-wait disabled:opacity-50"
        >
          {pending ? (zh ? "保存中…" : "Saving…") : (zh ? "保存" : "Save")}
        </button>
      </div>
    </form>
  );
}
