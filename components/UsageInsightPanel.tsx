import { Lightbulb } from "lucide-react";
import { DataMeta } from "@/components/data-display";
import type { UsageInsight } from "@/src/lib/usage/insights";

const TONE_CLASS: Record<UsageInsight["tone"], string> = {
  focus: "border-viz-blue-primary/35 bg-viz-blue-primary/[0.07]",
  neutral: "border-line bg-paper/[0.025]",
  attention: "border-viz-yellow-soft/40 bg-viz-yellow-soft/[0.06]",
};

export default function UsageInsightPanel({
  insights,
  zh,
  className = "",
}: {
  insights: UsageInsight[];
  zh: boolean;
  className?: string;
}) {
  if (insights.length === 0) return null;
  return (
    <section
      aria-labelledby="usage-insights-title"
      className={`rounded-2xl border border-line bg-card p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-viz-blue-primary/30 bg-viz-blue-primary/10 text-viz-blue-soft">
          <Lightbulb size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="usage-insights-title" className="text-[13px] font-semibold text-paper">
            {zh ? "本周期洞察" : "Period insights"}
          </h2>
          <DataMeta
            items={[zh ? "规则生成" : "Rule generated", zh ? "基于当前筛选范围" : "Current filter scope"]}
            className="mt-1"
          />
        </div>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        {insights.map((insight, index) => (
          <article key={insight.id} className={`rounded-xl border p-3.5 ${TONE_CLASS[insight.tone]}`}>
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 font-mono text-[10.5px] text-blue">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-xs font-semibold leading-relaxed text-paper">{insight.title}</h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-grey">{insight.detail}</p>
                <p className="mt-2 border-t border-line/70 pt-2 text-[11px] leading-relaxed text-paper/85">
                  {insight.action}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
