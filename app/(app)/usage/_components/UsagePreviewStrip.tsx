/* 个人面板预览条(20260822,未登录公开视图新增):用确定性示例数据渲染
   真实的面板组件(Hero 三卡 + 趋势图 + 热力图),让访客在登录前就看到
   「登录后我会得到什么」——替代静态截图:语言/主题/气质自动跟随,UI 迭代
   永不腐化。数据来自 src/lib/usage/preview-mock.ts(同一访客每次同一份),
   角上挂「示例数据」徽标注明来源,不冒充真实数据。
   只渲染精选子集:筛选栏/明细表/管理面板对未登录访客没有销售价值。 */
import { cookies } from "next/headers";
import { MetricCard } from "@/components/data-display";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { usagePreviewSnapshot } from "@/src/lib/usage/preview-mock";
import {
  USAGE_DISPLAY_CURRENCIES,
  type UsageDisplayCurrency,
} from "@/src/lib/usage/pricing";
import { UsageHeatmapGrid, UsageTrendChart } from "./UsageVisualizations";

/* 与用量中心同源的展示口径(币种随 kb_usage_ccy cookie;美元折算两位小数) */
function fmtCost(micros: number, ccy: UsageDisplayCurrency): string {
  const { rate, symbol } = USAGE_DISPLAY_CURRENCIES[ccy];
  const value = (micros / 1e6) * rate;
  return `${symbol}${value >= 0.01 ? value.toFixed(2) : value.toFixed(4)}`;
}

export default async function UsagePreviewStrip({
  locale,
}: {
  locale: Locale;
}) {
  const zh = locale === "zh";
  /* 展示币种与登录态看板同一 cookie 口径(默认 USD) */
  const store = await cookies();
  const ccy: UsageDisplayCurrency =
    store.get("kb_usage_ccy")?.value === "cny" ? "cny" : "usd";
  const currency = USAGE_DISPLAY_CURRENCIES[ccy];

  const { totals, trend, heatmap } = usagePreviewSnapshot();
  const inputWithCacheWrite = totals.inputTokens + totals.cacheWriteInputTokens;
  const hitRate =
    inputWithCacheWrite + totals.cacheReadInputTokens > 0
      ? totals.cacheReadInputTokens /
        (inputWithCacheWrite + totals.cacheReadInputTokens)
      : null;
  const heroCard = (
    label: string,
    value: string,
    caption: string,
  ) => (
    <MetricCard
      className="usage-hero rounded-2xl bg-transparent p-5"
      label={label}
      value={value}
      valueClassName="!text-3xl tracking-[-0.5px] text-paper"
      description={caption}
    />
  );

  return (
    <section className="mt-8" aria-label={t(locale, "usage.previewTitle")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-2">
        <h2 className="kb-eyebrow">{t(locale, "usage.previewTitle")}</h2>
        <span className="rounded-[2px] border border-line px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.1em] text-grey">
          {t(locale, "usage.previewBadge")}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-grey">
        {t(locale, "usage.previewNote")}
      </p>

      {/* 与登录态 dashboard 同一套视觉语汇(usage-dashboard 作用域 + Hero 三卡) */}
      <div className="usage-dashboard mt-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {heroCard(
            zh ? "预估费用" : "Est. cost",
            fmtCost(totals.costMicros, ccy),
            zh
              ? `近 30 天 · 按公开价目加权估算`
              : "Last 30 days · weighted by the public price catalog",
          )}
          {heroCard(
            zh ? "总 Token" : "Total tokens",
            compactNumber(totals.totalTokens, zh ? "zh" : "en"),
            zh
              ? `输入 ${compactNumber(inputWithCacheWrite, "zh")} · 输出 ${compactNumber(totals.outputTokens, "zh")} · 缓存读 ${compactNumber(totals.cacheReadInputTokens, "zh")}`
              : `Input ${compactNumber(inputWithCacheWrite, "en")} · output ${compactNumber(totals.outputTokens, "en")} · cache read ${compactNumber(totals.cacheReadInputTokens, "en")}`,
          )}
          {heroCard(
            zh ? "缓存命中率" : "Cache hit rate",
            hitRate === null ? "—" : `${(hitRate * 100).toFixed(1)}%`,
            zh
              ? "命中率越高,费用越低"
              : "Higher hit rate, lower cost",
          )}
        </div>

        <section className="mt-3 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-paper">
            {zh ? "近 30 天趋势" : "30-day trend"}
          </h3>
          <p className="mt-1 text-xs text-grey">
            {zh
              ? "输入(含缓存写)/ 缓存读 / 输出 / 推理 四段堆叠 · 7 日均值"
              : "Input (incl. cache write) / cache read / output / reasoning stacked · 7-slot avg"}
          </p>
          <div className="mt-4">
            <UsageTrendChart
              trend={trend}
              metric="tokens"
              granularity="day"
              rangeLabel="30d"
              zh={zh}
              currency={currency}
            />
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-paper">
            {zh ? "活跃热力图" : "Activity heatmap"}
          </h3>
          <p className="mt-1 text-xs text-grey">
            {zh
              ? "按星期 × 小时 · 你最清楚的,是自己什么时候在构建"
              : "By weekday × hour · you know best when you build"}
          </p>
          <div className="mt-4">
            <UsageHeatmapGrid
              heatmap={heatmap}
              metric="tokens"
              tzLabel={zh ? "本地时区" : "Local time"}
              zh={zh}
              currency={currency}
            />
          </div>
        </section>
      </div>
    </section>
  );
}
