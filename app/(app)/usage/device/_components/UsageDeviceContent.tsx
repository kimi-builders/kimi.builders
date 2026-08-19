/* 连接用量设备主体:完整页(/usage/device)与弹窗(@modal/(.)usage/device)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏);上方的「← 用量看板」返回链接保留。 */
import { Database, MonitorCheck, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getDeviceAuthorizationPreview } from "@/src/lib/usage/device";
import {
  usageDeviceDisplayName,
  usagePlatformLabel,
  usageSurfaceLabel,
} from "@/src/lib/usage/device-label";
import { normalizeUserCode } from "@/src/lib/usage/crypto";
import {
  USAGE_DASHBOARD_COMMAND,
  USAGE_INIT_COMMAND,
  usageDashboardConnectionGuide,
  usageInitMeaning,
} from "@/src/lib/usage/device-onboarding";
import CopyUsageCommandButton from "../../_components/CopyUsageCommandButton";
import DeviceApprovalForm from "../../_components/DeviceApprovalForm";
import DeviceCodeUrlCleanup from "./DeviceCodeUrlCleanup";

export default async function UsageDeviceContent({
  searchParams,
  showTitle = true,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
  showTitle?: boolean;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";
  const rawCode = (await searchParams).code;
  const code = normalizeUserCode(Array.isArray(rawCode) ? rawCode[0] ?? "" : rawCode ?? "");
  const preview = code ? await getDeviceAuthorizationPreview(code) : null;
  const previewStatus = preview?.status;
  const remainingMinutes = preview ? Math.ceil(preview.expiresInSeconds / 60) : 0;
  const suggestedDeviceName = preview ? usageDeviceDisplayName(preview) : "";
  const returnTo = `/usage/device${code ? `?code=${encodeURIComponent(code)}` : ""}`;

  return (
    <div className="mx-auto max-w-xl">
      <a href="/usage" className="inline-flex min-h-11 items-center font-mono text-[11px] text-grey hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
        ← {zh ? "用量看板" : "Usage"}
      </a>
      {showTitle && (
        <h1 className="mt-5 flex items-center gap-2 font-mono text-lg font-semibold">
          <MonitorCheck size={18} />
          {zh ? "连接用量设备" : "Connect usage device"}
        </h1>
      )}
      <p className="mt-3 text-sm leading-relaxed text-grey">
        {zh
          ? "只批准你刚刚在本地看板或终端发起的请求。kimi.builders 永远不会要求你的 Kimi、Moonshot 或其他供应商凭据。"
          : "Only approve a request you just started in your local dashboard or terminal. kimi.builders never asks for Kimi, Moonshot, or other provider credentials."}
      </p>

      {!code && (
        <>
          {/* 连接新设备:本地看板是新手主路径;init 保留为自动化/终端等价入口。 */}
          <section className="mt-7 rounded-xl border border-line bg-card p-4">
            <h2 className="font-mono text-[11px] tracking-[0.18em] text-grey">
              {zh ? "连接新设备" : "CONNECT A NEW DEVICE"}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-grey">
              {usageDashboardConnectionGuide(zh)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-10 shrink-0 font-mono text-[11px] text-grey">
                {zh ? "看板" : "UI"}
              </span>
              <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-line bg-bg">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-[11px] text-paper">
                  {USAGE_DASHBOARD_COMMAND}
                </code>
                <CopyUsageCommandButton
                  command={USAGE_DASHBOARD_COMMAND}
                  zh={zh}
                />
              </div>
            </div>
            <details className="mt-3 border-t border-line pt-3">
              <summary className="cursor-pointer font-mono text-[11px] text-grey hover:text-paper">
                {zh ? "终端备用方式" : "CLI fallback"}
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <span className="w-10 shrink-0 font-mono text-[11px] text-grey">CLI</span>
                <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-line bg-bg">
                  <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-[11px] text-paper">
                    {USAGE_INIT_COMMAND}
                  </code>
                  <CopyUsageCommandButton command={USAGE_INIT_COMMAND} zh={zh} />
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-grey/80">
                {usageInitMeaning(zh)}
              </p>
            </details>
          </section>

          <form method="get" className="mt-4 rounded-xl border border-line bg-card p-4">
            <label htmlFor="usage-device-code" className="font-mono text-[11px] tracking-[0.18em] text-grey">
              {zh ? "连接验证码" : "CONNECTION CODE"}
            </label>
            <p id="usage-device-code-help" className="mt-1 text-[11px] leading-relaxed text-grey">
              {zh ? "输入本地看板或 Collector 显示的 8 位验证码。" : "Enter the 8-character code shown by the local dashboard or Collector."}
            </p>
            <div className="mt-2 flex gap-2">
              <input
                id="usage-device-code"
                name="code"
                placeholder="ABCD-EFGH"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                aria-describedby="usage-device-code-help"
                minLength={8}
                maxLength={9}
                pattern="[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}"
                required
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-sm uppercase tracking-[0.14em] text-paper outline-none focus:border-blue"
              />
              <button className="min-h-11 rounded-lg border border-blue bg-blue px-4 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
                {zh ? "继续" : "Continue"}
              </button>
            </div>
          </form>
        </>
      )}

      {code && !preview && (
        <div className="mt-7 rounded-xl border border-line bg-card p-4">
          <DeviceCodeUrlCleanup />
          <p className="text-sm text-paper">{zh ? "验证码无效或不存在。" : "Code not found."}</p>
          <p className="mt-2 text-xs leading-relaxed text-grey">
            {zh ? "请回到本地看板重新生成，或在终端重新运行 init。" : "Generate a new code in the local dashboard, or run init again in the terminal."}
          </p>
        </div>
      )}

      {preview && (
        <>
          {previewStatus !== "pending" ? <DeviceCodeUrlCleanup /> : null}
          <section className="mt-7 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] tracking-[0.18em] text-grey">
                  {zh ? "连接请求" : "CONNECTION REQUEST"}
                </div>
                <div className="mt-2 font-mono text-xl font-semibold tracking-[0.12em] text-paper">
                  {code}
                </div>
              </div>
              <span className="border border-line px-2 py-1 font-mono text-[11px] text-grey">
                {usageSurfaceLabel(preview.surface)} · {usagePlatformLabel(preview.platform)}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-grey">{zh ? "客户端" : "Client"}</dt>
                <dd className="mt-1 text-paper">{preview.clientName}</dd>
              </div>
              <div>
                <dt className="text-grey">{zh ? "建议设备名" : "Suggested device"}</dt>
                <dd className="mt-1 text-paper">{suggestedDeviceName}</dd>
              </div>
              {(previewStatus === "pending" || previewStatus === "expired") && (
                <div>
                  <dt className="text-grey">{zh ? "验证码有效期" : "Code lifetime"}</dt>
                  <dd className="mt-1 text-paper">
                    {previewStatus === "expired"
                      ? (zh ? "已过期" : "Expired")
                      : (zh ? `约 ${remainingMinutes} 分钟` : `About ${remainingMinutes} min`)}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <ShieldCheck size={16} className="text-blue" />
              <h2 className="mt-3 text-sm font-medium text-paper">
                {zh ? "独立、可撤销的设备 Key" : "Independent, revocable device key"}
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-grey">
                {zh
                  ? "只允许上传、读取设置和删除本设备数据；撤销后立即失效。"
                  : "Scoped to usage sync and device data; it stops working immediately when revoked."}
              </p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <Database size={16} className="text-blue" />
              <h2 className="mt-3 text-sm font-medium text-paper">
                {zh ? "只上传统计数据" : "Metrics only"}
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-grey">
                {zh
                  ? "不上传 prompt、回复、工具结果、完整路径或供应商凭据。"
                  : "No prompts, responses, tool results, full paths, or provider credentials."}
              </p>
            </div>
          </section>

          {previewStatus === "approved" || previewStatus === "delivered" ? (
            <div className="mt-6 rounded-xl border border-blue/40 bg-blue/5 p-4">
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
          ) : !user ? (
            <div className="mt-6 rounded-xl border-l-2 border-blue bg-blue/5 p-4">
              <p className="text-sm text-paper">{zh ? "登录后批准这个设备。" : "Sign in to approve this device."}</p>
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
                <a
                  href={`/api/auth/github?next=${encodeURIComponent(returnTo)}`}
                  className="inline-flex min-h-11 items-center px-2 text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  GitHub →
                </a>
                <a
                  href={`/api/auth/google?next=${encodeURIComponent(returnTo)}`}
                  className="inline-flex min-h-11 items-center px-2 text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  Google →
                </a>
              </div>
            </div>
          ) : previewStatus === "pending" ? (
            <DeviceApprovalForm
              userCode={code!}
              suggestedName={suggestedDeviceName}
              locale={locale}
            />
          ) : (
            <div className="mt-6 rounded-xl border border-line bg-card p-4 text-sm text-grey">
              {zh ? `这次请求当前状态：${previewStatus}` : `This request is currently ${previewStatus}.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
