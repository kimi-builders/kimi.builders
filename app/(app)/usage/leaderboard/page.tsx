/* 社区用量榜:公开页,浏览无需登录;未登录不渲染「我的排名」卡,榜单内容与登录态一致。
   只展示主动 opt-in 成员的周期聚合(token 总量 + 活跃天数 + TOP 50 候选池内的预估费用),
   项目名、设备、时段等明细维度不进入查询,页面上也无从渲染。
   结构:资料页风格的概览 + 我的排名 + 可切换的总榜/Agent/模型单一主榜。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Trophy } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import AutoScrollNav from "@/components/AutoScrollNav";
import Avatar from "@/components/Avatar";
import ModelIcon from "@/components/ModelIcon";
import ShareButton from "@/components/ShareButton";
import {
  SEG_ITEM,
  SEG_ITEM_ACTIVE,
  SEG_ITEM_IDLE,
  SEG_WRAP,
} from "@/components/seg-classes";
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
import { usageSourceLabel } from "@/src/lib/usage/labels";
import { usageModelDisplayName } from "@/src/lib/usage/model-meta";
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

type BoardEntry = UsageLeaderboardEntry & { costMicros?: number };
type BoardKind = "overall" | "source" | "model";

function modelIconId(model: string): string {
  const id = model.toLowerCase();
  if (id.startsWith("kimi-") || id === "k3") return "kimi";
  if (id.startsWith("claude-")) return "claude";
  if (id.startsWith("gpt-") || id.startsWith("codex-")) return "openai";
  if (id.startsWith("gemini-")) return "gemini";
  if (id.startsWith("deepseek-")) return "deepseek";
  if (id.startsWith("qwen-")) return "qwen";
  if (id.startsWith("grok-")) return "grok";
  if (id.startsWith("minimax-")) return "minimax";
  if (id.startsWith("glm-")) return "glm";
  return "";
}

function modelLabel(model: string): string {
  return usageModelDisplayName({ model, modelCanonical: model });
}

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
    <tr className={`border-b border-line last:border-b-0 ${first ? "bg-blue/[0.06]" : ""}`}>
      <td className="w-12 px-3 py-3 text-center sm:w-14 sm:px-4 sm:py-3.5">
        <span
          className={`font-mono text-xs tabular-nums ${
            first ? "font-semibold text-blue" : "text-grey"
          }`}
        >
          {entry.rank}
        </span>
      </td>
      <td className="min-w-0 py-3 pr-2 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            url={entry.avatarUrl}
            handle={entry.handle}
            size={34}
            className="shrink-0"
          />
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
            <span className="mt-0.5 block truncate font-mono text-[10px] text-grey sm:hidden">
              {t(locale, "lb.days", { n: entry.activeDays })}
              {showCost ? ` · ${entry.costMicros ? fmtCost(entry.costMicros) : "—"}` : ""}
            </span>
          </span>
        </div>
      </td>
      <td
        className={`w-24 px-3 py-3 text-right font-mono text-paper sm:w-28 sm:px-4 sm:py-3.5 ${
          first ? "text-base font-semibold" : "text-sm"
        }`}
        title={entry.totalTokens.toLocaleString("en-US")}
      >
        {compact(entry.totalTokens)}
      </td>
      <td className="hidden w-24 px-4 py-3.5 text-right font-mono text-[11px] text-grey sm:table-cell">
        {t(locale, "lb.days", { n: entry.activeDays })}
      </td>
      {showCost ? (
        <td
          className="hidden w-24 px-4 py-3.5 text-right font-mono text-[11px] text-grey sm:table-cell"
          title={
            entry.costMicros
              ? `$${(entry.costMicros / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 })}`
              : undefined
          }
        >
          {/* 估费为 0 无法区分「免费」与「未定价」,一律显示 —(同看板原则) */}
          {entry.costMicros ? fmtCost(entry.costMicros) : "—"}
        </td>
      ) : null}
    </tr>
  );
}

function LeaderboardTable({
  entries,
  locale,
  showCost = false,
  caption,
}: {
  entries: BoardEntry[];
  locale: Locale;
  showCost?: boolean;
  caption: string;
}) {
  return (
    <table className="w-full table-fixed">
      <caption className="sr-only">{caption}</caption>
      <thead className="border-b border-line bg-paper/[0.02] font-mono text-[10px] tracking-[0.12em] text-grey">
        <tr>
          <th scope="col" className="w-12 px-3 py-2.5 text-center font-medium sm:w-14 sm:px-4">
            {t(locale, "lb.colRank")}
          </th>
          <th scope="col" className="py-2.5 text-left font-medium">
            {t(locale, "lb.colMember")}
          </th>
          <th scope="col" className="w-24 px-3 py-2.5 text-right font-medium sm:w-28 sm:px-4">
            {t(locale, "lb.colTokens")}
          </th>
          <th scope="col" className="hidden w-24 px-4 py-2.5 text-right font-medium sm:table-cell">
            {t(locale, "lb.colDays")}
          </th>
          {showCost ? (
            <th scope="col" className="hidden w-24 px-4 py-2.5 text-right font-medium sm:table-cell">
              {t(locale, "lb.colCost")}
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <LeaderboardRow key={entry.handle} entry={entry} locale={locale} showCost={showCost} />
        ))}
      </tbody>
    </table>
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
  const requestedBoard = param(raw.board);
  const board: BoardKind =
    requestedBoard === "source" || requestedBoard === "model" ? requestedBoard : "overall";
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
      board === "source" && selectedSource
        ? getUsageLeaderboard(period, { source: selectedSource })
        : Promise.resolve([]),
      board === "model" && selectedModel
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
  /* 周期页签保留当前榜型与维度;榜型和维度选择都进入 URL,可刷新/分享。 */
  const hrefFor = (over: {
    period?: UsageLeaderboardPeriod;
    board?: BoardKind;
    source?: string;
    model?: string;
  }): string => {
    const p = over.period ?? period;
    const b = over.board ?? board;
    const s = over.source ?? data?.selectedSource ?? param(raw.source);
    const m = over.model ?? data?.selectedModel ?? param(raw.model);
    let query = `?period=${p}`;
    if (b !== "overall") query += `&board=${b}`;
    if (s) query += `&source=${encodeURIComponent(s)}`;
    if (m) query += `&model=${encodeURIComponent(m)}`;
    return `/usage/leaderboard${query}`;
  };
  const shareTitle = (board: string, detail = ""): string =>
    `${t(locale, "lb.title")} · ${board}${detail ? ` ${detail}` : ""} · ${periodLabel}`;

  const chipNav = (
    kind: "source" | "model",
    label: string,
    items: string[],
    active: string,
    hrefOf: (item: string) => string,
  ) =>
    items.length > 0 ? (
      <AutoScrollNav
        activeKey={active}
        ariaLabel={label}
        className="scrollbar-none flex items-center gap-2 overflow-x-auto border-b border-line bg-paper/[0.015] px-4 py-3"
      >
        {items.map((item) => {
          const selected = item === active;
          const display = kind === "source" ? usageSourceLabel(item) : modelLabel(item);
          return (
            <Link
              key={item}
              href={hrefOf(item)}
              scroll={false}
              aria-current={selected ? "page" : undefined}
              data-scroll-active={selected || undefined}
              title={item !== display ? item : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:min-h-10 ${
                selected
                  ? "border-blue/40 bg-blue/10 text-paper"
                  : "border-line text-grey hover:border-paper/25 hover:text-paper"
              }`}
            >
              {kind === "source" ? (
                <AgentIcon id={item} size={14} />
              ) : (
                <ModelIcon id={modelIconId(item)} size={14} />
              )}
              {display}
            </Link>
          );
        })}
      </AutoScrollNav>
    ) : null;

  const boardOptions: { key: BoardKind; label: string }[] = [
    { key: "overall", label: t(locale, "lb.boardAll") },
    { key: "source", label: t(locale, "lb.boardSource") },
    { key: "model", label: t(locale, "lb.boardModel") },
  ];
  const boardLabel = boardOptions.find((item) => item.key === board)?.label ?? t(locale, "lb.boardAll");
  const activeDetail =
    board === "source"
      ? usageSourceLabel(data?.selectedSource ?? "")
      : board === "model"
        ? modelLabel(data?.selectedModel ?? "")
        : "";
  const activeEntries: BoardEntry[] =
    board === "source"
      ? (data?.sourceEntries ?? [])
      : board === "model"
        ? (data?.modelEntries ?? [])
        : (data?.entries ?? []);
  const boardHeading = `${boardLabel}${activeDetail ? ` · ${activeDetail}` : ""}`;
  const boardSharePath =
    board === "source"
      ? hrefFor({ board: "source", source: data?.selectedSource ?? "", model: "" })
      : board === "model"
        ? hrefFor({ board: "model", model: data?.selectedModel ?? "", source: "" })
        : `/usage/leaderboard?period=${period}`;

  return (
    <div>
      <header className="usage-hero overflow-hidden rounded-2xl border border-line p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue/20 bg-blue/10 text-blue">
            <Trophy size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[21px] font-semibold tracking-[0.2px] text-paper">
              {t(locale, "lb.title")}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-grey">
              {t(locale, "lb.intro")}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex max-w-2xl items-start gap-2 text-[11px] leading-relaxed text-grey/80">
            <ShieldCheck size={14} className="mt-px shrink-0 text-blue" aria-hidden="true" />
            <span>{t(locale, "lb.trust")}</span>
          </p>
          <nav
            aria-label={t(locale, "lb.title")}
            className={`${SEG_WRAP} shrink-0 max-sm:w-full`}
          >
            {USAGE_LEADERBOARD_PERIODS.map((p) => (
              <Link
                key={p}
                href={hrefFor({ period: p })}
                scroll={false}
                aria-current={p === period ? "page" : undefined}
                className={`${SEG_ITEM} justify-center max-sm:flex-1 ${
                  p === period ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
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
        <section
          aria-label={t(locale, "lb.mine")}
          className="mt-4 overflow-hidden rounded-2xl border border-line bg-card"
        >
          <h2 className="border-b border-line px-4 py-3 text-xs font-semibold text-paper sm:px-5">
            {t(locale, "lb.mine")}
          </h2>
          {settings.showOnLeaderboard ? (
            mine ? (
              <>
                <div className="grid grid-cols-3 divide-x divide-line">
                  {[
                    { label: t(locale, "lb.mineTokens"), value: mine.tokens },
                    { label: t(locale, "lb.mineDays"), value: mine.days },
                    { label: t(locale, "lb.mineCost"), value: mine.cost },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0 px-3 py-3.5 sm:px-5">
                      <div className="truncate font-mono text-[9px] tracking-[0.1em] text-grey sm:text-[10px]">
                        {item.label}
                      </div>
                      <div className="mt-1.5 font-mono text-lg font-semibold text-paper sm:text-xl">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-grey/80 sm:px-5">
                  {mine.hasData ? t(locale, "lb.mineCostNote") : t(locale, "lb.mineNoData")}
                </p>
              </>
            ) : null
          ) : (
            <div className="p-4 sm:p-5">
              <p className="text-sm leading-relaxed text-paper">
                {t(locale, "lb.mineOptin")}
              </p>
              <Link
                href="/usage#usage-management"
                className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-mono text-[11px] text-paper transition-colors hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                {t(locale, "lb.mineOptinCta")}
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {data === null ? (
        <p role="alert" className="mt-4 rounded-2xl border border-line bg-card p-5 text-sm text-grey">
          {t(locale, "lb.loadError")}
        </p>
      ) : data.all.length === 0 ? (
        <section className="mt-4 rounded-2xl border border-line bg-card p-5">
          <p className="text-sm text-paper">{t(locale, "lb.empty")}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-grey">{t(locale, "lb.emptyHint")}</p>
          <Link
            href="/usage#usage-management"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-mono text-[11px] text-paper transition-colors hover:border-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "lb.emptyCta")}
          </Link>
        </section>
      ) : (
        <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-card">
          <div className="border-b border-line p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-paper">{boardHeading}</h2>
                <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-grey">
                  {periodLabel}
                </p>
              </div>
              <ShareButton
                path={boardSharePath}
                title={shareTitle(boardLabel, activeDetail)}
                locale={locale}
              />
            </div>
            <nav
              aria-label={t(locale, "lb.title")}
              className={`${SEG_WRAP} mt-4 max-sm:flex max-sm:w-full`}
            >
              {boardOptions.map((item) => (
                <Link
                  key={item.key}
                  href={hrefFor({ board: item.key })}
                  scroll={false}
                  aria-current={item.key === board ? "page" : undefined}
                  className={`${SEG_ITEM} justify-center max-sm:flex-1 ${
                    item.key === board ? SEG_ITEM_ACTIVE : SEG_ITEM_IDLE
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {board === "source"
            ? chipNav(
                "source",
                t(locale, "lb.boardSource"),
                data.sources,
                data.selectedSource,
                (item) => hrefFor({ board: "source", source: item }),
              )
            : null}
          {board === "model"
            ? chipNav(
                "model",
                t(locale, "lb.boardModel"),
                data.models,
                data.selectedModel,
                (item) => hrefFor({ board: "model", model: item }),
              )
            : null}

          {activeEntries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-grey">{t(locale, "lb.dimEmpty")}</p>
          ) : (
            <LeaderboardTable
              entries={activeEntries}
              locale={locale}
              showCost={board === "overall"}
              caption={`${boardHeading} · ${periodLabel}`}
            />
          )}
        </section>
      )}

      <div className="mt-4 rounded-xl border border-line bg-card/60 px-4 py-3 text-[11px] leading-relaxed text-grey/80">
        <p>{t(locale, "lb.scope")}</p>
        {board === "overall" ? <p className="mt-1.5">{t(locale, "lb.costScope")}</p> : null}
      </div>
    </div>
  );
}
