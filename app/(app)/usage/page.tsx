import type { Metadata } from "next";
import {
  Activity,
  BarChart3,
  Clock3,
  KeyRound,
  Link2,
  Monitor,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { relTime } from "@/src/lib/format";
import { getLocale } from "@/src/lib/i18n-server";
import { listUsageDevices } from "@/src/lib/usage/device";
import { getUsageDashboard, type UsageTrendDay } from "@/src/lib/usage/query";
import { getUsageSettings } from "@/src/lib/usage/settings";
import {
  deleteAllUsageAction,
  revokeUsageDeviceAction,
  updateUsageSettingsAction,
} from "./actions";

export const metadata: Metadata = { title: "用量 — kimi.builders" };

function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

function duration(seconds: number, zh: boolean): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return zh ? `${hours}时 ${minutes}分` : `${hours}h ${minutes}m`;
  return zh ? `${minutes} 分钟` : `${minutes}m`;
}

function fillTrend(data: UsageTrendDay[], from: string, days: number): UsageTrendDay[] {
  const values = new Map(data.map((item) => [item.day, item]));
  const start = new Date(from);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    return (
      values.get(day) ?? {
        day,
        inputTokens: 0,
        cacheWriteInputTokens: 0,
        cacheReadInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        requests: 0,
        sessions: 0,
        activeSeconds: 0,
        costMicros: 0,
      }
    );
  });
}

function TrendChart({ trend, zh }: { trend: UsageTrendDay[]; zh: boolean }) {
  const max = Math.max(1, ...trend.map((item) => item.totalTokens));
  const labelIndices = new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1]);
  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="flex h-48 min-w-[520px] items-end gap-1.5 border-b border-line px-1">
          {trend.map((item, index) => {
            const totalHeight = item.totalTokens === 0 ? 1 : Math.max(4, (item.totalTokens / max) * 100);
            const cache = item.cacheWriteInputTokens + item.cacheReadInputTokens;
            const inputShare = item.totalTokens ? (item.inputTokens / item.totalTokens) * 100 : 0;
            const cacheShare = item.totalTokens ? (cache / item.totalTokens) * 100 : 0;
            return (
              <div key={item.day} className="group relative flex h-full min-w-1 flex-1 items-end">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden bg-card transition-opacity group-hover:opacity-80"
                  style={{ height: `${totalHeight}%` }}
                  title={`${item.day} · ${compact(item.totalTokens)} tokens`}
                >
                  <span className="block bg-blue" style={{ height: `${inputShare}%` }} />
                  <span className="block bg-grey/45" style={{ height: `${cacheShare}%` }} />
                  <span className="min-h-px flex-1 bg-paper/70" />
                </div>
                <span className="sr-only">
                  {item.day}: {item.totalTokens.toLocaleString()} tokens
                </span>
                {labelIndices.has(index) && (
                  <span
                    className={`absolute -bottom-6 whitespace-nowrap font-mono text-[9px] text-grey ${
                      index === trend.length - 1 ? "right-0" : index === 0 ? "left-0" : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    {item.day.slice(5)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-4 font-mono text-[10px] text-grey">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-blue" />{zh ? "输入" : "Input"}</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-grey/45" />{zh ? "缓存" : "Cache"}</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-paper/70" />{zh ? "输出/推理" : "Output/reasoning"}</span>
      </div>
    </div>
  );
}
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const zh = locale === "zh";

  if (!user) {
    return (
      <div>
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <BarChart3 size={17} /> {zh ? "用量" : "Usage"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-grey">
          {zh
            ? "以 Kimi 为第一公民的多工具 AI 编程用量中心。数据默认私有，只上传统计字段。"
            : "A Kimi-first usage center for AI coding tools. Data stays private and only metrics are uploaded."}
        </p>
        <p className="mt-8 text-sm text-grey">
          {zh ? "登录后连接设备：" : "Sign in to connect a device:"}
          <a href="/api/auth/github?next=%2Fusage" className="ml-2 text-blue hover:underline">GitHub</a>
          <a href="/api/auth/google?next=%2Fusage" className="ml-3 text-blue hover:underline">Google</a>
        </p>
      </div>
    );
  }

  const rawDays = (await searchParams).days;
  const parsedDays = Number(Array.isArray(rawDays) ? rawDays[0] : rawDays);
  const days = [7, 30, 90].includes(parsedDays) ? parsedDays : 30;
  const [dashboard, devices, settings] = await Promise.all([
    getUsageDashboard(user.id, days),
    listUsageDevices(user.id),
    getUsageSettings(user.id),
  ]);
  const trend = fillTrend(dashboard.trend, dashboard.from, dashboard.days);
  const hasData = dashboard.totals.totalTokens > 0 || dashboard.totals.sessions > 0;

  return (
    <div className="usage-dashboard">
      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
            <BarChart3 size={18} /> {zh ? "用量中心" : "Usage center"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
            {zh
              ? "Kimi-first，多工具兼容。这里只接收 token、时间与计数，不接收对话内容、完整路径或供应商凭据。"
              : "Kimi-first and multi-tool ready. Only token, timing, and count metrics are accepted—never conversations, full paths, or provider credentials."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] text-grey">
            <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-blue" />{zh ? "默认私有" : "Private by default"}</span>
            <span>·</span>
            <span>{dashboard.lastSyncAt ? (zh ? `最近同步 ${relTime(dashboard.lastSyncAt, locale)}` : `Synced ${relTime(dashboard.lastSyncAt, locale)}`) : (zh ? "尚未同步" : "Not synced yet")}</span>
          </div>
        </div>
        <a
          href="/usage/device"
          className="inline-flex shrink-0 items-center justify-center gap-2 border border-blue bg-blue px-4 py-2.5 font-mono text-xs font-semibold text-white hover:opacity-90"
        >
          <Link2 size={14} /> {zh ? "连接设备" : "Connect device"}
        </a>
      </header>

      {!hasData && (
        <section className="mt-6 border border-blue/35 bg-blue/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <KeyRound size={18} className="mt-0.5 shrink-0 text-blue" />
            <div className="min-w-0 flex-1">
              <h2 className="font-mono text-sm font-semibold text-paper">
                {zh ? "连接 Kimi Code，生成第一份用量" : "Connect Kimi Code for your first report"}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-grey">
                {zh
                  ? "Collector 在本地读取 Kimi 当前版与旧版日志；先展示将上传的字段，再由浏览器批准这台设备。"
                  : "The collector reads current and legacy Kimi logs locally, previews uploaded fields, then asks you to approve this device in the browser."}
              </p>
              <pre className="mt-4 overflow-x-auto border border-line bg-bg px-3 py-3 font-mono text-xs text-paper">
                npx @kimi-builders/usage init
              </pre>
              <ol className="mt-4 grid gap-3 text-xs text-grey sm:grid-cols-3">
                <li><span className="mr-2 font-mono text-blue">01</span>{zh ? "本地检测日志" : "Detect local logs"}</li>
                <li><span className="mr-2 font-mono text-blue">02</span>{zh ? "浏览器批准设备" : "Approve in browser"}</li>
                <li><span className="mr-2 font-mono text-blue">03</span>{zh ? "幂等增量同步" : "Idempotent sync"}</li>
              </ol>
            </div>
          </div>
        </section>
      )}

      <nav aria-label={zh ? "时间范围" : "Date range"} className="mt-6 flex items-center gap-1 border-b border-line pb-3">
        {[7, 30, 90].map((range) => (
          <a
            key={range}
            href={`/usage?days=${range}`}
            aria-current={range === days ? "page" : undefined}
            className={`px-3 py-1.5 font-mono text-[11px] transition-colors ${
              range === days ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
            }`}
          >
            {range}D
          </a>
        ))}
      </nav>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Activity, label: zh ? "API 等价估费" : "API equivalent", value: dashboard.totals.costMicros > 0 ? `$${(dashboard.totals.costMicros / 1e6).toFixed(2)}` : "—", note: zh ? "未定价模型不计费" : "Unpriced models excluded" },
          { icon: BarChart3, label: zh ? "总 Token" : "Total tokens", value: compact(dashboard.totals.totalTokens), note: `${compact(dashboard.totals.inputTokens)} ${zh ? "输入" : "input"}` },
          { icon: Clock3, label: zh ? "活跃时长" : "Active time", value: duration(dashboard.totals.activeSeconds, zh), note: zh ? "基于本地交互时间" : "From local interactions" },
          { icon: Monitor, label: zh ? "会话 / 设备" : "Sessions / devices", value: `${compact(dashboard.totals.sessions)} / ${dashboard.activeDevices}`, note: `${compact(dashboard.totals.requests)} ${zh ? "次调用" : "requests"}` },
        ].map(({ icon: Icon, label, value, note }) => (
          <article key={label} className="border border-line bg-card p-4">
            <div className="flex items-center justify-between text-grey"><span className="font-mono text-[10px] tracking-[0.14em]">{label}</span><Icon size={14} /></div>
            <div className="mt-4 font-mono text-xl font-semibold text-paper">{value}</div>
            <div className="mt-1.5 text-[10px] text-grey">{note}</div>
          </article>
        ))}
      </section>

      <section className="mt-4 border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">{zh ? "每日趋势" : "DAILY TREND"}</h2>
            <p className="mt-1 text-[10px] text-grey">{zh ? "UTC 日界 · 30 分钟事实桶聚合" : "UTC days · aggregated from 30-minute buckets"}</p>
          </div>
          <span className="font-mono text-[10px] text-grey">{compact(dashboard.totals.totalTokens)} tokens</span>
        </div>
        <div className="mt-6"><TrendChart trend={trend} zh={zh} /></div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">{zh ? "设备与 Key" : "DEVICES & KEYS"}</h2>
            <a href="/usage/device" className="font-mono text-[10px] text-blue hover:underline">+ {zh ? "连接" : "Connect"}</a>
          </div>
          {devices.length === 0 ? (
            <p className="mt-5 text-xs text-grey">{zh ? "还没有已授权设备。" : "No authorized devices yet."}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {devices.map((device) => (
                <li key={device.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-paper">{device.name}</div>
                      <div className="mt-1 font-mono text-[9px] text-grey">{device.platform} · {device.surface}{device.lastSeenAt ? ` · ${relTime(device.lastSeenAt, locale)}` : ""}</div>
                    </div>
                    {device.revokedAt ? (
                      <span className="shrink-0 border border-line px-2 py-1 font-mono text-[9px] text-grey">{zh ? "已撤销" : "Revoked"}</span>
                    ) : (
                      <form action={revokeUsageDeviceAction}>
                        <input type="hidden" name="device_id" value={device.id} />
                        <button className="flex items-center gap-1 font-mono text-[9px] text-grey hover:text-paper"><Trash2 size={11} />{zh ? "撤销" : "Revoke"}</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-line bg-card p-4 sm:p-5">
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-paper">{zh ? "隐私设置" : "PRIVACY"}</h2>
          <form action={updateUsageSettingsAction} className="mt-4">
            <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-line pb-4">
              <span>
                <span className="block text-sm text-paper">{zh ? "上传项目目录名" : "Upload project names"}</span>
                <span className="mt-1 block text-[10px] leading-relaxed text-grey">{zh ? "仅 basename；关闭后 Collector 的 payload 中不会出现 project 字段。" : "Basename only; when off, project is absent from collector payloads."}</span>
              </span>
              <input type="checkbox" name="upload_project" value="1" defaultChecked={settings.uploadProject} className="mt-1 h-4 w-4 shrink-0 accent-blue" />
            </label>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] text-grey">{zh ? `保留 ${settings.retentionDays} 天` : `${settings.retentionDays}-day retention`}</span>
              <button className="border border-line px-3 py-1.5 font-mono text-[10px] text-paper hover:border-blue">{zh ? "保存" : "Save"}</button>
            </div>
          </form>
          <details className="mt-5 border-t border-line pt-4">
            <summary className="cursor-pointer font-mono text-[10px] text-grey hover:text-paper">{zh ? "删除全部用量数据" : "Delete all usage data"}</summary>
            <form action={deleteAllUsageAction} className="mt-3">
              <p className="text-[10px] leading-relaxed text-grey">{zh ? "输入 DELETE 后删除所有事实数据和 legacy 数据；设备授权保持不变。" : "Type DELETE to remove all fact and legacy data. Device authorization remains."}</p>
              <div className="mt-2 flex gap-2">
                <input name="confirmation" placeholder="DELETE" className="min-w-0 flex-1 border border-line bg-bg px-2 py-1.5 font-mono text-xs text-paper outline-none focus:border-blue" />
                <button className="border border-red-500/40 px-3 font-mono text-[10px] text-red-400 hover:border-red-500">{zh ? "删除" : "Delete"}</button>
              </div>
            </form>
          </details>
        </section>
      </div>

      <p className="mt-5 text-[10px] leading-relaxed text-grey/80">
        {zh ? "可信度说明：数据来自用户设备的自报日志，可能不完整或被修改；它用于个人洞察，不是可验证的计量凭证。" : "Trust note: data is self-reported from user devices and may be incomplete or modified. It is for personal insight, not verified metering."}
      </p>
    </div>
  );
}
