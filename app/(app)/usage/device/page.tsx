import type { Metadata } from "next";
import { Database, MonitorCheck, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getDeviceAuthorizationPreview } from "@/src/lib/usage/device";
import { normalizeUserCode } from "@/src/lib/usage/crypto";
import DeviceApprovalForm from "../_components/DeviceApprovalForm";

export const metadata: Metadata = { title: "连接用量设备 — kimi.builders" };

export default async function UsageDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";
  const rawCode = (await searchParams).code;
  const code = normalizeUserCode(Array.isArray(rawCode) ? rawCode[0] ?? "" : rawCode ?? "");
  const preview = code ? await getDeviceAuthorizationPreview(code) : null;
  const returnTo = `/usage/device${code ? `?code=${encodeURIComponent(code)}` : ""}`;

  return (
    <div className="mx-auto max-w-xl">
      <a href="/usage" className="font-mono text-[11px] text-grey hover:text-blue">
        ← {zh ? "用量看板" : "Usage"}
      </a>
      <h1 className="mt-5 flex items-center gap-2 font-mono text-lg font-semibold">
        <MonitorCheck size={18} />
        {zh ? "连接用量设备" : "Connect usage device"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-grey">
        {zh
          ? "只批准你刚刚在终端发起的请求。kimi.builders 永远不会要求你的 Kimi、Moonshot 或其他供应商凭据。"
          : "Only approve a request you just started in your terminal. kimi.builders never asks for Kimi, Moonshot, or other provider credentials."}
      </p>

      {!code && (
        <form method="get" className="mt-7 border border-line bg-card p-4">
          <label className="font-mono text-[10px] tracking-[0.18em] text-grey">
            {zh ? "终端验证码" : "TERMINAL CODE"}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              name="code"
              placeholder="ABCD-EFGH"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              className="min-w-0 flex-1 border border-line bg-bg px-3 py-2.5 font-mono text-sm uppercase tracking-[0.14em] text-paper outline-none focus:border-blue"
            />
            <button className="border border-blue bg-blue px-4 font-mono text-xs font-semibold text-white">
              {zh ? "继续" : "Continue"}
            </button>
          </div>
        </form>
      )}

      {code && !preview && (
        <div className="mt-7 border border-line bg-card p-4">
          <p className="text-sm text-paper">{zh ? "验证码无效或不存在。" : "Code not found."}</p>
          <p className="mt-2 text-xs leading-relaxed text-grey">
            {zh ? "请回到终端重新运行 init。" : "Return to the terminal and run init again."}
          </p>
        </div>
      )}

      {preview && (
        <>
          <section className="mt-7 border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] tracking-[0.18em] text-grey">
                  {zh ? "连接请求" : "CONNECTION REQUEST"}
                </div>
                <div className="mt-2 font-mono text-xl font-semibold tracking-[0.12em] text-paper">
                  {code}
                </div>
              </div>
              <span className="border border-line px-2 py-1 font-mono text-[10px] text-grey">
                {preview.platform} · {preview.surface}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-grey">{zh ? "客户端" : "Client"}</dt>
                <dd className="mt-1 text-paper">{preview.clientName}</dd>
              </div>
              <div>
                <dt className="text-grey">{zh ? "建议设备名" : "Suggested device"}</dt>
                <dd className="mt-1 text-paper">{preview.deviceName}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-line p-4">
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
            <div className="border border-line p-4">
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
            <div className="mt-6 border border-blue/40 bg-blue/5 p-4">
              <p className="font-mono text-sm font-semibold text-paper">
                {zh ? "设备已连接" : "Device connected"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {zh
                  ? "可以返回终端了。设备 Key 只会在那里交付并保存一次。"
                  : "Return to your terminal. The device key is delivered and stored there only once."}
              </p>
              <a href="/usage" className="mt-4 inline-block text-sm text-blue hover:underline">
                {zh ? "返回用量看板 →" : "Back to usage →"}
              </a>
            </div>
          ) : !user ? (
            <div className="mt-6 border-l-2 border-blue bg-blue/5 p-4">
              <p className="text-sm text-paper">{zh ? "登录后批准这个设备。" : "Sign in to approve this device."}</p>
              <div className="mt-3 flex gap-4 font-mono text-xs">
                <a
                  href={`/api/auth/github?next=${encodeURIComponent(returnTo)}`}
                  className="text-blue hover:underline"
                >
                  GitHub →
                </a>
                <a
                  href={`/api/auth/google?next=${encodeURIComponent(returnTo)}`}
                  className="text-blue hover:underline"
                >
                  Google →
                </a>
              </div>
            </div>
          ) : preview.status === "pending" ? (
            <DeviceApprovalForm
              userCode={code!}
              suggestedName={preview.deviceName}
              locale={locale}
            />
          ) : (
            <div className="mt-6 border border-line bg-card p-4 text-sm text-grey">
              {zh ? `这次请求当前状态：${preview.status}` : `This request is currently ${preview.status}.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
