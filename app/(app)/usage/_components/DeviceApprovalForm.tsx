"use client";

import { useActionState } from "react";
import CheckboxControl from "@/components/CheckboxControl";
import type { Locale } from "@/src/lib/i18n";
import {
  decideUsageDeviceAction,
  type DeviceDecisionState,
} from "../actions";
import DeviceCodeUrlCleanup from "../device/_components/DeviceCodeUrlCleanup";

const initialState: DeviceDecisionState = {};

export default function DeviceApprovalForm({
  userCode,
  suggestedName,
  locale,
}: {
  userCode: string;
  suggestedName: string;
  locale: Locale;
}) {
  const [state, action, pending] = useActionState(decideUsageDeviceAction, initialState);
  const zh = locale === "zh";

  if (state.status === "approved") {
    return (
      <div className="mt-6 border border-blue/40 bg-blue/5 p-4">
        <DeviceCodeUrlCleanup />
        <p className="font-mono text-sm font-semibold text-paper">
          {zh ? "设备已连接" : "Device connected"}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-grey">
          {zh
            ? "可以返回本地看板或终端了。设备 Key 只会交付并保存一次。"
            : "Return to the local dashboard or terminal. The device key is delivered and stored only once."}
        </p>
        <a href="/usage" className="mt-4 inline-flex min-h-11 items-center text-sm text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
          {zh ? "返回用量看板 →" : "Back to usage →"}
        </a>
      </div>
    );
  }

  if (state.status === "denied") {
    return (
      <div className="mt-6 border border-line bg-card p-4 text-sm text-grey">
        <DeviceCodeUrlCleanup />
        {zh ? "已拒绝本次连接请求。" : "This connection request was denied."}
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="user_code" value={userCode} />
      <label className="block">
        <span className="font-mono text-[11px] tracking-[0.18em] text-grey">
          {zh ? "设备别名" : "DEVICE NAME"}
        </span>
        <input
          name="device_name"
          defaultValue={suggestedName}
          maxLength={80}
          required
          className="mt-2 min-h-11 w-full border border-line bg-bg px-3 text-sm text-paper outline-none transition-colors focus:border-blue"
        />
      </label>

      <label className="flex cursor-pointer items-start gap-3 border border-line bg-card p-3">
        <CheckboxControl
          name="upload_project"
          value="1"
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm text-paper">
            {zh ? "上传项目目录名" : "Upload project directory names"}
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-grey">
            {zh
              ? "默认关闭。只上传 basename，不上传完整路径；可随时在看板关闭。"
              : "Off by default. Only the basename is sent, never a full path; disable it anytime."}
          </span>
        </span>
      </label>

      {(state.error || state.status) && (
        <p role="alert" className="border-l-2 border-red-500 pl-3 text-xs text-red-400">
          {zh
            ? "验证码不可用、已过期，或登录状态已失效。请在本地看板或终端重新开始连接。"
            : "The code is unavailable or expired, or your session ended. Restart linking in the local dashboard or terminal."}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="min-h-11 border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
        >
          {pending ? (zh ? "处理中…" : "Working…") : zh ? "批准并连接" : "Approve & connect"}
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          disabled={pending}
          className="min-h-11 rounded-lg border border-line px-5 font-mono text-xs text-grey hover:border-paper/30 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50"
        >
          {zh ? "拒绝" : "Deny"}
        </button>
      </div>
    </form>
  );
}
