/* /works 列表右栏:作品统计(上架/作者/声明投入/本周新)+ 活跃 Agent 分布
   + 本周最受欢迎 + 声明口径说明(Awesome 引流)。 */
import Link from "next/link";
import { ArrowBigUp, SquarePen } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import WorkKindIcon from "@/components/WorkKindIcon";
import { agentName } from "@/src/lib/agents";
import { compactNumber } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getPublicWorksRail } from "@/src/lib/public-rails-cache";
import { workKind, workKindLabel } from "@/src/lib/work-kinds";
import Widget from "./Widget";

export default async function WorksRail({
  locale,
  loggedIn,
}: {
  locale: Locale;
  loggedIn: boolean;
}) {
  const { stats, agents, kinds, top } = await getPublicWorksRail();
  const agentMax = Math.max(1, ...agents.map((a) => a.count));
  return (
    <>
      {/* 社区口号 + 引句:一个讲人,一个讲作品,成对出现 */}
      <div className="space-y-1.5 border-l-2 border-blue pl-3 font-mono text-[11px] leading-relaxed">
        <p className="text-paper">{t(locale, "works.slogan")}</p>
        <p className="text-grey/80">{t(locale, "about.quote")}</p>
      </div>

      <Widget
        title={t(locale, "works.statsTitle")}
        note={t(locale, "works.statsNote")}
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            { n: stats.works, l: t(locale, "works.statWorks") },
            { n: stats.authors, l: t(locale, "works.statAuthors") },
            {
              n: compactNumber(stats.claimedSum, locale),
              l: t(locale, "works.statClaimed"),
            },
            { n: stats.weeklyNew, l: t(locale, "works.statWeeklyNew") },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-mono text-lg font-semibold text-paper">{s.n}</div>
              <div className="mt-0.5 font-mono text-[10px] text-grey">{s.l}</div>
            </div>
          ))}
        </div>
        {loggedIn && (
          <Link
            href="/works/new"
            className="mt-4 flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-blue font-mono text-xs font-semibold text-blue transition-colors hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <SquarePen size={13} aria-hidden="true" />
            {t(locale, "rail.worksSubmit")}
          </Link>
        )}
      </Widget>

      {kinds.length > 0 && (
        <Widget title={t(locale, "works.kindDist")} note={t(locale, "works.activeAgentsNote")}>
          <ul>
            {kinds.slice(0, 6).map((k) => {
              const meta = workKind(k.kind);
              return (
                <li key={k.kind}>
                  <Link
                    href={`/works?kind=${k.kind}`}
                    className="group flex items-center gap-2.5 border-b border-line py-2 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                  >
                    <WorkKindIcon id={meta.id} size={14} className="shrink-0 text-grey" />
                    <span className="min-w-0 flex-1 truncate text-xs text-paper transition-colors group-hover:text-blue">
                      {workKindLabel(k.kind, locale === "zh")}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-grey">
                      {k.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      {agents.length > 0 && (
        <Widget
          title={t(locale, "works.activeAgents")}
          note={t(locale, "works.activeAgentsNote")}
        >
          <ul className="space-y-2.5">
            {agents.map((a) => (
              <li key={a.agent} className="flex items-center gap-2.5">
                <span className="flex w-28 shrink-0 items-center gap-1.5 text-[11px] text-grey">
                  <AgentIcon id={a.agent} size={13} />
                  <span className="truncate">{agentName(a.agent)}</span>
                </span>
                <span className="h-1.5 min-w-0 flex-1 rounded-full bg-paper/[0.06]">
                  <span
                    className="block h-full rounded-full bg-blue/70"
                    style={{ width: `${Math.max((a.count / agentMax) * 100, 4)}%` }}
                  />
                </span>
                <span className="shrink-0 font-mono text-[10px] text-grey">{a.count}</span>
              </li>
            ))}
          </ul>
        </Widget>
      )}

      <Widget title={t(locale, "works.topWeekly")}>
        {top.length === 0 ? (
          <p className="text-xs text-grey">{t(locale, "rail.worksTopEmpty")}</p>
        ) : (
          <ul className="space-y-2.5">
            {top.map((w, i) => (
              <li key={w.id} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-[10px] text-grey">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Link
                  href={`/works/${w.id}`}
                  className="min-w-0 flex-1 truncate text-paper transition-colors hover:text-blue"
                >
                  {w.name}
                </Link>
                <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-grey">
                  <ArrowBigUp size={11} />
                  {w.voteCount}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-line pt-3 text-[10.5px] leading-relaxed text-grey/80">
          {t(locale, "works.claimNote")}{" "}
          <Link
            href="/awesome"
            className="font-mono text-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {t(locale, "works.goAwesome")}
          </Link>
        </p>
      </Widget>
    </>
  );
}
