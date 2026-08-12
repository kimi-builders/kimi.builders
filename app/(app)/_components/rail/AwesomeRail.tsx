/* /awesome 右栏:收录统计 + 收录口径(带计数,点行即筛选)+ Agent 分布
   + 推荐规则(必须填原作者/不进作品墙/无徽章)+ 推荐入口。 */
import Link from "next/link";
import { SquarePen } from "lucide-react";
import AgentIcon from "@/components/AgentIcon";
import WorkScopeIcon from "@/components/WorkScopeIcon";
import { agentName } from "@/src/lib/agents";
import { t, type Locale } from "@/src/lib/i18n";
import {
  getAwesomeScopeStats,
  getAwesomeStats,
  getWorksAgentStats,
} from "@/src/lib/works";
import Widget from "./Widget";

const SCOPES = [
  { id: "base", labelKey: "awesome.scopeBase", hintKey: "awesome.scopeBaseHint" },
  { id: "eco", labelKey: "awesome.scopeEco", hintKey: "awesome.scopeEcoHint" },
  { id: "part", labelKey: "awesome.scopePart", hintKey: "awesome.scopePartHint" },
] as const;

export default async function AwesomeRail({
  locale,
  loggedIn,
}: {
  locale: Locale;
  loggedIn: boolean;
}) {
  const [stats, scopeStats, agents] = await Promise.all([
    getAwesomeStats(),
    getAwesomeScopeStats(),
    getWorksAgentStats("awesome", 6),
  ]);
  const agentMax = Math.max(1, ...agents.map((a) => a.count));
  return (
    <>
      <Widget
        title={t(locale, "awesome.statsTitle")}
        note={t(locale, "awesome.statsNote")}
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            { n: stats.items, l: t(locale, "awesome.statItems") },
            { n: stats.agents, l: t(locale, "awesome.statAgents") },
            { n: stats.weeklyNew, l: t(locale, "awesome.statWeeklyNew") },
            { n: stats.recommenders, l: t(locale, "awesome.statRecommenders") },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-mono text-lg font-semibold text-paper">{s.n}</div>
              <div className="mt-0.5 font-mono text-[10px] text-grey">{s.l}</div>
            </div>
          ))}
        </div>
      </Widget>

      <Widget
        title={t(locale, "awesome.scopeTitle")}
        note={t(locale, "awesome.scopeNote")}
      >
        <ul>
          {SCOPES.map((s) => (
            <li key={s.id}>
              <Link
                href={`/awesome?scope=${s.id}`}
                className="group flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                <WorkScopeIcon id={s.id} size={14} className="shrink-0 text-grey" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-paper transition-colors group-hover:text-blue">
                    {t(locale, s.labelKey)}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-grey/80">
                    {t(locale, s.hintKey)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] font-semibold text-grey">
                  {scopeStats[s.id]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Widget>

      {agents.length > 0 && (
        <Widget
          title={t(locale, "awesome.agentDist")}
          note={t(locale, "awesome.agentDistNote")}
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

      <Widget title={t(locale, "awesome.rulesTitle")}>
        <p className="text-xs leading-relaxed text-grey">
          {t(locale, "awesome.rulesBody")}
        </p>
        {loggedIn && (
          <Link
            href="/works/new"
            className="mt-3 flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-blue font-mono text-xs font-semibold text-blue transition-colors hover:bg-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <SquarePen size={13} aria-hidden="true" />
            {t(locale, "awesome.recommend")}
          </Link>
        )}
      </Widget>
    </>
  );
}
