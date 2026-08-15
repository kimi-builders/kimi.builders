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
          ? "只批准你刚刚在终端发起的请求。kimi.builders 永远不会要求你的 Kimi、Moonshot 或其他供应商凭据。"
          : "Only approve a request you just started in your terminal. kimi.builders never asks for Kimi, Moonshot, or other provider credentials."}
      </p>

      {!code && (
        <>
          {/* 连接新设备(2026-08-14):先有命令再有码——没发起过请求的人
              到这一步不会卡住;命令行样式与「同步数据」弹窗一致 */}
          <section className="mt-7 rounded-xl border border-line bg-card p-4">
            <h2 className="font-mono text-[11px] tracking-[0.18em] text-grey">
              {zh ? "连接新设备" : "CONNECT A NEW DEVICE"}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-grey">
              {zh
                ? "还没有验证码?在终端运行 init——它会打印 8 位验证码并打开本页:"
                : "No code yet? Run init in your terminal — it prints the 8-character code and opens this page:"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-10 shrink-0 font-mono text-[11px] text-grey">
                {zh ? "连接" : "Link"}
              </span>
              <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-line bg-bg">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-[11px] text-paper">
                  npx @kimi.builders/usage@latest init
                </code>
                <CopyUsageCommandButton
                  command="npx @kimi.builders/usage@latest init"
                  zh={zh}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-grey/80">
              {zh
                ? "项目名默认不上传;同步 Key 可随时在「设备」里撤销。"
                : "Project names stay off by default; revoke a sync key anytime under Devices."}
            </p>
          </section>

          <form method="get" className="mt-4 rounded-xl border border-line bg-card p-4">
            <label htmlFor="usage-device-code" className="font-mono text-[11px] tracking-[0.18em] text-grey">
              {zh ? "终端验证码" : "TERMINAL CODE"}
            </label>
            <p id="usage-device-code-help" className="mt-1 text-[11px] leading-relaxed text-grey">
              {zh ? "输入 Collector 在终端显示的 8 位验证码。" : "Enter the 8-character code shown by the Collector."}
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
              <button className="min-h-11 rounded-lg border border-blue bg-blue px-4 font-mono text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
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
            {zh ? "请回到终端重新运行 init。" : "Return to the terminal and run init again."}
          </p>
        </div>
      )}

      {preview && (
        <>
          {preview.status !== "pending" ? <DeviceCodeUrlCleanup /> : null}
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
              <span className="border border-line px-2 py-1 font-mono text-[10px] text-grey">
                {usageSurfaceLabel(preview.surface)} · {usagePlatformLabel(preview.platform)}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-grey">{zh ? "客户端" : "Client"}</dt>
                <dd className="mt-1 text-paper">{preview.clientName}</dd>
              </div>
              <div>
                <dt className="text-grey">{zh ? "建议设备名" : "Suggested device"}</dt>
                <dd className="mt-1 text-paper">{suggestedDeviceName}</dd>
              </div>
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

          {preview.status === "approved" || preview.status === "delivered" ? (
            <div className="mt-6 rounded-xl border border-blue/40 bg-blue/5 p-4">
              <p className="font-mono text-sm font-semibold text-paper">
                {zh ? "设备已连接" : "Device connected"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {zh
                  ? "可以返回终端了。设备 Key 只会在那里交付并保存一次。"
                  : "Return to your terminal. The device key is delivered and stored there only once."}
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
          ) : preview.status === "pending" ? (
            <DeviceApprovalForm
              userCode={code!}
              suggestedName={suggestedDeviceName}
              locale={locale}
            />
          ) : (
            <div className="mt-6 rounded-xl border border-line bg-card p-4 text-sm text-grey">
              {zh ? `这次请求当前状态：${preview.status}` : `This request is currently ${preview.status}.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
