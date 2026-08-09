/* 社区用量榜(P1-1 + 增强):公开页,浏览无需登录;未登录不渲染「我的排名」卡,
   榜单内容与登录态一致。只展示主动 opt-in 成员的周期聚合(token 总量 + 活跃天数 +
   TOP 50 候选池内的预估费用),项目名、设备、时段等明细维度不进入查询,页面上也无从渲染。
   结构:24H/7D/30D 周期页签 + 我的排名卡 + 总榜/分工具榜/分模型榜三张榜卡,
   每张榜卡右上角分享(标题含周期与榜名)。
   视觉遵守设计语言:硬边、细线、mono 大数字、无圆角无阴影(头像沿用全站圆形惯例);
   第一名以蓝色边线 + 加大 mono 数字强调。 */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import ShareButton from "@/components/ShareButton";
import { getSessionUser } from "@/src/lib/auth/session";
import { t, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  displayUsageLeaderboardRank,
  getUsageLeaderboard,
  getUsageLeaderboardCosts,
  getUsageLeaderboardDimensions,
  normalizeUsageLeaderboardPeriod,
  usageLeaderboardRank,
  USAGE_LEADERBOARD_LIMIT,
  USAGE_LEADERBOARD_PERIODS,
  type UsageLeaderboardEntry,
  type UsageLeaderboardPeriod,
} from "@/src/lib/usage/leaderboard";
import { getUsageSettings } from "@/src/lib/usage/settings";

export const metadata: Metadata = { title: "社区用量榜 — kimi.builders" };

/* 与 /usage 看板同款的紧凑数字:1.2k / 3.4M / 5.6B;精确值放 title。 */
function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

/* 估费固定以 USD 展示(榜单无币种切换):>= $0.01 两位小数,否则四位。 */
function fmtCost(micros: number): string {
  const value = micros / 1e6;
  return `$${value >= 0.01 ? value.toFixed(2) : value.toFixed(4)}`;
}

const GRID_COLS = "grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-3 px-4";
const GRID_COLS_COST =
  "grid grid-cols-[2rem_minmax(0,1fr)_4.5rem_3.5rem_4.5rem] items-center gap-3 px-4";

type BoardEntry = UsageLeaderboardEntry & { costMicros?: number };

function LeaderboardRow({
  entry,
  locale,
  showCost = false,
}: {
  entry: BoardEntry;
  locale: Locale;
  showCost?: boolean;
}) {
  const first = entry.rank === 1;
  return (
    <li
      className={`${showCost ? GRID_COLS_COST : GRID_COLS} py-3 ${
        first ? "border-b border-blue bg-blue/5" : "border-b border-line last:border-b-0"
      }`}
    >
      <span
        className={`text-right font-mono ${
          first ? "text-base font-semibold text-blue" : "text-sm text-grey"
        }`}
      >
        {entry.rank}
      </span>
      <span className="flex min-w-0 items-center gap-2.5">
        {entry.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={entry.avatarUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border border-paper/10"
          />
        ) : null}
        <span className="min-w-0">
          <Link
            href={`/u/${entry.handle}`}
            className="block truncate font-mono text-xs text-paper transition-colors hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            @{entry.handle}
          </Link>
          {entry.name ? (
            <span className="block truncate text-[11px] text-grey">{entry.name}</span>
          ) : null}
        </span>
      </span>
      <span
        className={`text-right font-mono text-paper ${first ? "text-lg font-semibold" : "text-sm"}`}
        title={entry.totalTokens.toLocaleString("en-US")}
      >
        {compact(entry.totalTokens)}
      </span>
      <span className="text-right font-mono text-[11px] text-grey">
        {t(locale, "lb.days", { n: entry.activeDays })}
      </span>
      {showCost ? (
        <span
          className="text-right font-mono text-[11px] text-grey"
          title={
            entry.costMicros
              ? `$${(entry.costMicros / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 })}`
              : undefined
          }
        >
          {/* 估费为 0 无法区分「免费」与「未定价」,一律显示 —(同看板原则) */}
          {entry.costMicros ? fmtCost(entry.costMicros) : "—"}
        </span>
      ) : null}
    </li>
  );
}

/* 榜卡壳:标题 + 右上角分享(复制的标题含周期与榜名)。 */
function BoardCard({
  title,
  sharePath,
  shareTitle,
  locale,
  children,
}: {
  title: string;
  sharePath: string;
  shareTitle: string;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 border border-line bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="font-mono text-[10px] tracking-[0.14em] text-grey">{title}</h2>
        <ShareButton path={sharePath} title={shareTitle} locale={locale} />
      </div>
      {children}
    </section>
  );
}

function BoardHead({ locale, showCost = false }: { locale: Locale; showCost?: boolean }) {
  return (
    <div
      className={`${showCost ? GRID_COLS_COST : GRID_COLS} border-b border-line py-2.5 font-mono text-[10px] tracking-[0.14em] text-grey`}
    >
      <span className="text-right">{t(locale, "lb.colRank")}</span>
      <span>{t(locale, "lb.colMember")}</span>
      <span className="text-right">{t(locale, "lb.colTokens")}</span>
      <span className="text-right">{t(locale, "lb.colDays")}</span>
      {showCost ? <span className="text-right">{t(locale, "lb.colCost")}</span> : null}
    </div>
  );
}

interface BoardData {
  entries: BoardEntry[];
  all: UsageLeaderboardEntry[];
  sources: string[];
  models: string[];
  selectedSource: string;
  selectedModel: string;
  sourceEntries: UsageLeaderboardEntry[];
  modelEntries: UsageLeaderboardEntry[];
}

export default async function UsageLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const param = (value: string | string[] | undefined): string => {
    const v = Array.isArray(value) ? value[0] : value;
    return v && v.trim() ? v : "";
  };
  const period = normalizeUsageLeaderboardPeriod(param(raw.period));
  const user = await getSessionUser();
  const locale = await getLocale(user);

  /* 我的排名需要知道本人是否 opt-in;设置读取失败就藏掉卡片,不影响榜单。 */
  const settingsPromise = user
    ? getUsageSettings(user.id).catch(() => null)
    : Promise.resolve(null);

  let data: BoardData | null = null;
  try {
    /* 第一轮:全量 opt-in 聚合(无 LIMIT,行数 = 周期内有数据的公开成员数,
       我的 token/活跃天数名次需要全量排序)+ 两个维度的 chips 候选。 */
    const [all, sources, models] = await Promise.all([
      getUsageLeaderboard(period, { limit: 0 }),
      getUsageLeaderboardDimensions("source", period),
      getUsageLeaderboardDimensions("model", period),
    ]);
    const selectedSource = param(raw.source) || sources[0] || "";
    const selectedModel = param(raw.model) || models[0] || "";
    const top = all.slice(0, USAGE_LEADERBOARD_LIMIT);
    /* 第二轮:TOP 50 候选池的估费 + 两张分维度榜,互不依赖,并行。 */
    const [costs, sourceEntries, modelEntries] = await Promise.all([
      getUsageLeaderboardCosts(
        top.map((entry) => entry.userId),
        period,
      ),
      selectedSource
        ? getUsageLeaderboard(period, { source: selectedSource })
        : Promise.resolve([]),
      selectedModel
        ? getUsageLeaderboard(period, { model: selectedModel })
        : Promise.resolve([]),
    ]);
    data = {
      entries: top.map((entry) => ({
        ...entry,
        costMicros: costs.get(entry.userId) ?? 0,
      })),
      all,
      sources,
      models,
      selectedSource,
      selectedModel,
      sourceEntries,
      modelEntries,
    };
  } catch {
    data = null;
  }
  const settings = await settingsPromise;

  /* 我的排名:同分不并列(主指标 → 副指标 → handle 字典序的稳定全序);
     token/活跃天数在全量 opt-in 上取名次,费用只在 TOP 50 候选池内取名次。 */
  let mine: { tokens: string; days: string; cost: string; hasData: boolean } | null = null;
  if (user && settings?.showOnLeaderboard && data) {
    const tokenRank = usageLeaderboardRank(data.all, user.id, "tokens");
    const daysRank = usageLeaderboardRank(data.all, user.id, "days");
    const costRank =
      tokenRank !== null && tokenRank <= USAGE_LEADERBOARD_LIMIT
        ? usageLeaderboardRank(data.entries, user.id, "cost")
        : null;
    const fmtRank = (display: string): string =>
      display === "—" || display.endsWith("+") ? display : `#${display}`;
    mine = {
      tokens: fmtRank(displayUsageLeaderboardRank(tokenRank)),
      days: fmtRank(displayUsageLeaderboardRank(daysRank)),
      cost:
        tokenRank === null
          ? "—"
          : tokenRank > USAGE_LEADERBOARD_LIMIT
            ? `${USAGE_LEADERBOARD_LIMIT}+`
            : fmtRank(displayUsageLeaderboardRank(costRank)),
      hasData: tokenRank !== null,
    };
  }

  const periodLabel = t(
    locale,
    period === "24h" ? "lb.period24" : period === "7d" ? "lb.period7" : "lb.period30",
  );
  /* 周期页签保留当前维度选择;维度 chips 保留周期与另一维度。 */
  const hrefFor = (over: {
    period?: UsageLeaderboardPeriod;
    source?: string;
    model?: string;
  }): string => {
    const p = over.period ?? period;
    const s = over.source ?? data?.selectedSource ?? param(raw.source);
    const m = over.model ?? data?.selectedModel ?? param(raw.model);
    let query = `?period=${p}`;
    if (s) query += `&source=${encodeURIComponent(s)}`;
    if (m) query += `&model=${encodeURIComponent(m)}`;
    return `/usage/leaderboard${query}`;
  };
  const shareTitle = (board: string, detail = ""): string =>
    `${t(locale, "lb.title")} · ${board}${detail ? ` ${detail}` : ""} · ${periodLabel}`;

  const chipNav = (
    label: string,
    items: string[],
    active: string,
    hrefOf: (item: string) => string,
  ) =>
    items.length > 0 ? (
      <nav
        aria-label={label}
        className="flex flex-wrap items-center gap-1 border-b border-line px-4 py-2.5"
      >
        {items.map((item) => (
          <Link
            key={item}
            href={hrefOf(item)}
            scroll={false}
            aria-current={item === active ? "page" : undefined}
            className={`inline-flex min-h-8 items-center px-2.5 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
              item === active ? "bg-paper text-bg" : "text-grey hover:bg-paper/5 hover:text-paper"
            }`}
          >
            {item}
          </Link>
        ))}
      </nav>
    ) : null;

  return (
    <div>
      <header className="border-b border-line pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
              <Trophy size={18} aria-hidden="true" /> {t(locale, "lb.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
              {t(locale, "lb.intro")}
            </p>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-grey/80">
              {t(locale, "lb.trust")}
            </p>
          </div>
          <nav aria-label={t(locale, "lb.title")} className="flex shrink-0 items-center gap-1">
            {USAGE_LEADERBOARD_PERIODS.map((p) => (
              <Link
                key={p}
                href={hrefFor({ period: p })}
                scroll={false}
                aria-current={p === period ? "page" : undefined}
                className={`inline-flex min-h-11 items-center px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue ${
                  p === period ? "bg-paper text-bg" : "text-grey hover:bg-card hover:text-paper"
                }`}
              >
                {t(
                  locale,
                  p === "24h" ? "lb.period24" : p === "7d" ? "lb.period7" : "lb.period30",
                )}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {user && settings !== null ? (
        <section aria-label={t(locale, "lb.mine")} className="mt-6 border border-line bg-card p-4">
          <h2 className="font-mono text-[10px] tracking-[0.14em] text-grey">
            {t(locale, "lb.mine")}
          </h2>
          {settings.showOnLeaderboard ? (
            mine ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { label: t(locale, "lb.mineTokens"), value: mine.tokens },
                    { label: t(locale, "lb.mineDays"), value: mine.days },
                    { label: t(locale, "lb.mineCost"), value: mine.cost },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="font-mono text-[10px] tracking-[0.14em] text-grey">
                        {item.label}
                      </div>
                      <div className="mt-1 font-mono text-xl font-semibold text-paper">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-grey/80">
                  {mine.hasData ? t(locale, "lb.mineCostNote") : t(locale, "lb.mineNoData")}
                </p>
              </>
            ) : null
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-paper">
                {t(locale, "lb.mineOptin")}
              </p>
              <Link
                href="/usage#usage-management"
                className="mt-3 inline-flex min-h-11 items-center border border-line px-4 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                {t(locale, "lb.mineOptinCta")}
              </Link>
            </>
          )}
        </section>
      ) : null}

      {data === null ? (
        <p role="alert" className="mt-6 border border-line bg-card p-5 text-sm text-grey">
          {t(locale, "lb.loadError")}
        </p>
      ) : data.all.length === 0 ? (
        <section className="mt-6 border border-line bg-card p-5">
          <p className="text-sm text-paper">{t(locale, "lb.empty")}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-grey">{t(locale, "lb.emptyHint")}</p>
          <Link
            href="/usage#usage-management"
            className="mt-4 inline-flex min-h-11 items-center border border-line px-4 font-mono text-[11px] text-paper hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "lb.emptyCta")}
          </Link>
        </section>
      ) : (
        <>
          <BoardCard
            title={`${t(locale, "lb.boardAll")} · ${periodLabel}`}
            sharePath={`/usage/leaderboard?period=${period}`}
            shareTitle={shareTitle(t(locale, "lb.boardAll"))}
            locale={locale}
          >
            <BoardHead locale={locale} showCost />
            <ol>
              {data.entries.map((entry) => (
                <LeaderboardRow key={entry.handle} entry={entry} locale={locale} showCost />
              ))}
            </ol>
          </BoardCard>

          <BoardCard
            title={`${t(locale, "lb.boardSource")} · ${periodLabel}`}
            sharePath={hrefFor({ source: data.selectedSource, model: "" })}
            shareTitle={shareTitle(t(locale, "lb.boardSource"), data.selectedSource)}
            locale={locale}
          >
            {chipNav(t(locale, "lb.boardSource"), data.sources, data.selectedSource, (item) =>
              hrefFor({ source: item }),
            )}
            {data.sourceEntries.length === 0 ? (
              <p className="px-4 py-5 text-sm text-grey">{t(locale, "lb.dimEmpty")}</p>
            ) : (
              <>
                <BoardHead locale={locale} />
                <ol>
                  {data.sourceEntries.map((entry) => (
                    <LeaderboardRow key={entry.handle} entry={entry} locale={locale} />
                  ))}
                </ol>
              </>
            )}
          </BoardCard>

          <BoardCard
            title={`${t(locale, "lb.boardModel")} · ${periodLabel}`}
            sharePath={hrefFor({ model: data.selectedModel, source: "" })}
            shareTitle={shareTitle(t(locale, "lb.boardModel"), data.selectedModel)}
            locale={locale}
          >
            {chipNav(t(locale, "lb.boardModel"), data.models, data.selectedModel, (item) =>
              hrefFor({ model: item }),
            )}
            {data.modelEntries.length === 0 ? (
              <p className="px-4 py-5 text-sm text-grey">{t(locale, "lb.dimEmpty")}</p>
            ) : (
              <>
                <BoardHead locale={locale} />
                <ol>
                  {data.modelEntries.map((entry) => (
                    <LeaderboardRow key={entry.handle} entry={entry} locale={locale} />
                  ))}
                </ol>
              </>
            )}
          </BoardCard>
        </>
      )}

      <div className="mt-5 space-y-2 text-[11px] leading-relaxed text-grey/80">
        <p>{t(locale, "lb.scope")}</p>
        <p>{t(locale, "lb.costScope")}</p>
        <p>{t(locale, "lb.trust")}</p>
      </div>
    </div>
  );
}
