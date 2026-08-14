import Link from "next/link";
import { CalendarRange, KeyRound, SearchX, ShieldCheck } from "lucide-react";
import CopyUsageCommandButton from "./CopyUsageCommandButton";
import UsageMethodologyDialog from "./UsageMethodologyDialog";

export function UsageFirstRun({
  hasAuthorizedDevice,
  currentRange,
  tzLabel,
  tzOffsetMinutes,
  zh,
}: {
  hasAuthorizedDevice: boolean;
  currentRange: { from: string; to: string };
  tzLabel: string;
  tzOffsetMinutes: number;
  zh: boolean;
}) {
  const localCmd = "npx @kimi.builders/usage@latest dashboard";
  const command = hasAuthorizedDevice
    ? "npx @kimi.builders/usage@latest sync"
    : "npx @kimi.builders/usage@latest init";
  /* 与 usage-cli README「支持的本地用量来源」一致:11 个自动扫描 + Cursor 显式启用 */
  const sources = [
    "Kimi Code", "Claude Code", "Codex", "OpenCode", "Gemini CLI", "Antigravity",
    "Copilot CLI", "Roo Code", "Pi Agent", "ZCode", "WorkBuddy",
  ];

  return (
    <section className="mt-6 rounded-2xl border border-blue/35 bg-blue/5 p-5 sm:p-6" aria-labelledby="usage-first-run-title">
      <div className="flex items-start gap-3">
        <KeyRound size={19} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-[0.14em] text-blue">
            {zh ? "本地优先 · 约 2 分钟" : "LOCAL-FIRST · ABOUT 2 MINUTES"}
          </p>
          <h2 id="usage-first-run-title" className="mt-1 font-mono text-base font-semibold text-paper">
            {hasAuthorizedDevice
              ? zh ? "同步第一份用量报告" : "Sync your first usage report"
              : zh ? "连接本地 Collector" : "Connect your local Collector"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-grey">
            {zh
              ? "Collector 只在本机读取各 Agent 的统计日志。上传前会展示字段预览;对话内容、完整路径和供应商凭据不会离开设备。"
              : "The Collector reads statistical logs from your agents locally. You preview the fields before upload; conversations, full paths, and provider credentials never leave the device."}
          </p>
          <div className="mt-3 flex max-w-3xl flex-wrap gap-1.5">
            {sources.map((s) => (
              <span key={s} className="rounded-md border border-line bg-bg px-2 py-1 font-mono text-[10px] text-grey">
                {s}
              </span>
            ))}
            <span className="rounded-md border border-dashed border-line px-2 py-1 font-mono text-[10px] text-grey/80">
              {zh ? "Cursor(CSV 显式启用)" : "Cursor (explicit CSV)"}
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] tracking-[0.12em] text-grey">
                {zh ? "① 本地看板(不需要账号)" : "① LOCAL DASHBOARD (NO ACCOUNT)"}
              </p>
              <div className="mt-2 flex min-w-0 items-stretch overflow-hidden rounded-lg border border-line bg-bg">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-xs text-paper">
                  {localCmd}
                </code>
                <CopyUsageCommandButton command={localCmd} zh={zh} />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-grey/80">
                {zh
                  ? "打开即得趋势、分布与费用估算,全程不联网、不上传。"
                  : "Trends, breakdowns and cost estimates on open — fully offline, nothing uploaded."}
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] tracking-[0.12em] text-grey">
                {zh ? "② 同步到社区(跨设备 / 公开档案 / 排行榜)" : "② SYNC TO COMMUNITY (DEVICES / PROFILE / RANKS)"}
              </p>
              <div className="mt-2 flex min-w-0 items-stretch overflow-hidden rounded-lg border border-line bg-bg">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-xs text-paper">
                  {command}
                </code>
                <CopyUsageCommandButton command={command} zh={zh} />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-grey/80">
                {zh
                  ? "init 一次完成设备连接与首传;之后用 sync 增量同步。"
                  : "init links this device and does the first upload; sync keeps it incrementally updated."}
              </p>
            </div>
          </div>

          <figure className="mt-5 overflow-hidden rounded-xl border border-line bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/usage/dashboard-overview.png"
              alt={zh ? "本地看板实拍:趋势、分布与费用估算" : "Local dashboard: trends, breakdowns and cost estimates"}
              loading="lazy"
              className="w-full"
            />
            <figcaption className="border-t border-line px-4 py-2.5 font-mono text-[10.5px] text-grey">
              {zh
                ? "本地看板实拍——由真实本机 Agent 日志生成,不是设计稿"
                : "The local dashboard, rendered from real local agent logs — not a mockup"}
            </figcaption>
          </figure>

          <ol className="mt-5 grid gap-3 text-sm text-grey sm:grid-cols-3">
            <li className="border-l-2 border-blue/60 pl-3">
              <span className="block font-mono text-[11px] text-blue">01</span>
              <span className="mt-1 block">{zh ? "检测本地日志并预览字段" : "Detect logs and preview fields"}</span>
            </li>
            <li className="border-l-2 border-blue/60 pl-3">
              <span className="block font-mono text-[11px] text-blue">02</span>
              <span className="mt-1 block">{zh ? "在浏览器批准这台设备" : "Approve this device in the browser"}</span>
            </li>
            <li className="border-l-2 border-blue/60 pl-3">
              <span className="block font-mono text-[11px] text-blue">03</span>
              <span className="mt-1 block">{zh ? "完成幂等增量同步" : "Complete an idempotent sync"}</span>
            </li>
          </ol>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Link
              href="/usage/device"
              className="inline-flex min-h-11 items-center rounded-lg border border-blue px-4 font-mono text-[11px] font-semibold text-paper hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
            >
              {zh ? "输入设备授权码" : "Enter device code"}
            </Link>
            <UsageMethodologyDialog
              kind="tokens"
              zh={zh}
              currentRange={currentRange}
              tzLabel={tzLabel}
              tzOffsetMinutes={tzOffsetMinutes}
            />
          </div>

          <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-grey">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
            <p>
              {zh
                ? "项目名默认不上传;同步 Key 可随时撤销,远端数据也可按设备或全部删除。"
                : "Project names are off by default. You can revoke sync keys and delete remote data per device or in full."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function UsageRangeEmpty({
  clearHref,
  range30Href,
  range90Href,
  filtersActive,
  zh,
}: {
  clearHref: string;
  range30Href: string;
  range90Href: string;
  filtersActive: boolean;
  zh: boolean;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-card p-6 text-center sm:p-8" aria-labelledby="usage-range-empty-title">
      <SearchX size={24} className="mx-auto text-grey" aria-hidden="true" />
      <h2 id="usage-range-empty-title" className="mt-3 font-mono text-sm font-semibold text-paper">
        {zh ? "当前范围没有匹配数据" : "No matching data in this range"}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-grey">
        {filtersActive
          ? zh
            ? "已同步的历史没有被删除;当前日期和维度筛选组合没有结果。可以先清除维度筛选,或扩大日期范围。"
            : "Your synced history is still intact. This combination of date and dimension filters has no results. Clear dimensions or widen the range."
          : zh
            ? "已同步的历史没有被删除;所选日期内暂时没有活动。可以扩大日期范围继续查看。"
            : "Your synced history is still intact. There is no activity in the selected dates; widen the range to keep exploring."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {filtersActive && (
          <Link href={clearHref} scroll={false} className="inline-flex min-h-11 items-center rounded-lg border border-blue px-4 font-mono text-[11px] font-semibold text-paper hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
            {zh ? "清除维度筛选" : "Clear dimension filters"}
          </Link>
        )}
        <Link href={range30Href} scroll={false} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-mono text-[11px] text-grey hover:border-blue hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
          <CalendarRange size={14} aria-hidden="true" /> 30D
        </Link>
        <Link href={range90Href} scroll={false} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-mono text-[11px] text-grey hover:border-blue hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
          <CalendarRange size={14} aria-hidden="true" /> 90D
        </Link>
      </div>
    </section>
  );
}
