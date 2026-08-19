import AgentIcon from "@/components/AgentIcon";
import { ChartHeader, CoverageBadge, MetricCard } from "@/components/data-display";
import { compactNumber } from "@/src/lib/format";
import type { UsageAttribution, UsageTotals } from "@/src/lib/usage/query";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function tone(value: number): "good" | "attention" | "neutral" {
  if (value >= 0.8) return "good";
  if (value > 0) return "attention";
  return "neutral";
}

export default function UsageAttributionSummary({
  attribution,
  totals,
  currency,
  sourceLabel,
  zh,
}: {
  attribution: UsageAttribution;
  totals: UsageTotals;
  currency: { symbol: string; rate: number };
  sourceLabel: (source: string) => string;
  zh: boolean;
}) {
  const period = attribution.period;
  if (period.totalTokens <= 0) return null;

  const topAgent = period.agent.rows[0];
  const topModel = period.model.rows[0];
  const topProject = period.project.rows[0];
  const agentModel = period.pairs.agentModel.rows[0];
  const agentProject = period.pairs.agentProject.rows[0];
  const tokensPerRequest = totals.requests > 0 ? totals.totalTokens / totals.requests : 0;
  const tokensPerMinute =
    totals.activeSeconds > 0 ? totals.totalTokens / (totals.activeSeconds / 60) : 0;
  const costPerMillionMicros =
    totals.totalTokens > 0 ? (totals.costMicros * 1_000_000) / totals.totalTokens : 0;
  const costPerMillion = (costPerMillionMicros / 1_000_000) * currency.rate;
  const inputSide =
    totals.inputTokens + totals.cacheWriteInputTokens + totals.cacheReadInputTokens;
  const cacheRate = inputSide > 0 ? totals.cacheReadInputTokens / inputSide : null;

  const rows = [
    topAgent
      ? {
          key: "agent",
          label: "Agent",
          value: sourceLabel(topAgent.key),
          share: topAgent.share,
          icon: <AgentIcon id={topAgent.key} context="chart" />,
        }
      : null,
    topModel
      ? {
          key: "model",
          label: zh ? "模型" : "Model",
          value: topModel.label,
          share: topModel.share,
          icon: null,
        }
      : null,
    topProject
      ? {
          key: "project",
          label: zh ? "项目" : "Project",
          value: topProject.label,
          share: topProject.share,
          icon: null,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <ChartHeader
        title={zh ? "归因与效率" : "Attribution and efficiency"}
        description={
          zh
            ? "同一事实窗口联合计算，不由独立分布反推"
            : "Calculated jointly from the same fact window"
        }
        source={zh ? "来源：当前筛选范围" : "Source: current filter scope"}
        actions={
          <div className="flex flex-wrap justify-end gap-1.5">
            <CoverageBadge
              label={zh ? "Agent 覆盖" : "Agent coverage"}
              value={pct(period.agent.coverage)}
              tone={tone(period.agent.coverage)}
            />
            <CoverageBadge
              label={zh ? "模型覆盖" : "Model coverage"}
              value={pct(period.model.coverage)}
              tone={tone(period.model.coverage)}
            />
            <CoverageBadge
              label={zh ? "项目覆盖" : "Project coverage"}
              value={pct(period.project.coverage)}
              tone={tone(period.project.coverage)}
            />
            <CoverageBadge
              label={zh ? "精确计量" : "Exact measurement"}
              value={pct(period.exactMeasurementCoverage)}
              tone={tone(period.exactMeasurementCoverage)}
            />
          </div>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.08em] text-grey/70">
            {zh ? "最大贡献者 · 可归因数据内占比" : "TOP CONTRIBUTORS · SHARE OF ATTRIBUTABLE DATA"}
          </p>
          <dl className="mt-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-line py-2.5 last:border-b-0"
              >
                <dt className="font-mono text-xs text-grey">{row.label}</dt>
                <dd className="flex min-w-0 items-center gap-2 text-xs text-paper">
                  {row.icon}
                  <span className="truncate" title={row.value}>{row.value}</span>
                </dd>
                <dd className="font-mono text-xs font-semibold text-paper">{pct(row.share)}</dd>
              </div>
            ))}
          </dl>
          {(agentModel || agentProject) && (
            <div className="mt-3 border-t border-dashed border-viz-grid pt-3 font-mono text-xs leading-relaxed text-grey">
              {agentModel && (
                <p>
                  {zh ? "主要 Agent × 模型：" : "Top agent × model: "}
                  <span className="text-paper">
                    {sourceLabel(agentModel.primaryKey)} × {agentModel.secondaryLabel} · {pct(agentModel.share)}
                  </span>
                </p>
              )}
              {agentProject && (
                <p className="mt-1">
                  {zh ? "主要 Agent × 项目：" : "Top agent × project: "}
                  <span className="text-paper">
                    {sourceLabel(agentProject.primaryKey)} × {agentProject.secondaryLabel} · {pct(agentProject.share)}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MetricCard
            label={zh ? "每请求 Token" : "Tokens per request"}
            value={compactNumber(tokensPerRequest, zh ? "zh" : "en")}
            accent
            meta={[zh ? "总 Token ÷ 请求数" : "total tokens ÷ requests"]}
          />
          <MetricCard
            label={zh ? "每百万 Token 估费" : "Cost per 1M tokens"}
            value={`${currency.symbol}${costPerMillion >= 0.01 ? costPerMillion.toFixed(2) : costPerMillion.toFixed(4)}`}
            meta={[zh ? "API 等价估算" : "API-equivalent estimate"]}
          />
          <MetricCard
            label={zh ? "每活跃分钟 Token" : "Tokens per active minute"}
            value={compactNumber(tokensPerMinute, zh ? "zh" : "en")}
            meta={[zh ? "用量效率参考" : "throughput reference"]}
          />
          <MetricCard
            label={zh ? "缓存读取占比" : "Cache read share"}
            value={cacheRate === null ? "—" : pct(cacheRate)}
            meta={[zh ? "输入侧口径" : "input-side basis"]}
          />
        </div>
      </div>
    </section>
  );
}
