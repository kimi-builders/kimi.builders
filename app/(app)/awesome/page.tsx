/* Awesome Kimi:全世界用 Kimi 构建的项目(全部来源:成员作品 + 推荐的站外项目)。
   顶部 Agent 筛选芯片(?agent=<id>),卡片与 /works 共用 WorkCard,
   首屏与「加载更多」共用 ../works/_components/works-page(游标分页,P1-4)。
   收录口径见 awesome.intro(放宽:参与即可)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { SquarePen, Star } from "lucide-react";
import LoadMore from "@/components/LoadMore";
import { AGENTS } from "@/src/lib/agents";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import AgentIcon from "@/components/AgentIcon";
import { loadMoreWorksAction } from "../works/actions";
import { loadWorksCards } from "../works/_components/works-page";

export const metadata: Metadata = { title: "Awesome — kimi.builders" };

export default async function AwesomePage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent } = await searchParams;
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const active = AGENTS.some((a) => a.id === agent) ? agent : undefined;
  const page = await loadWorksCards({ awesome: true, agent: active }, user, locale);

  const chipCls = (on: boolean) =>
    `flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-xs transition-colors ${
      on
        ? "border-blue text-blue"
        : "border-line text-grey hover:border-paper/30 hover:text-paper"
    }`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <Star size={17} />
          {t(locale, "nav.awesome")}
        </h1>
        {user && (
          <Link
            href="/works/new"
            className="flex items-center gap-2 border border-blue px-4 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
          >
            <SquarePen size={13} />
            {t(locale, "awesome.recommend")}
          </Link>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-grey">
        {t(locale, "awesome.intro")}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/awesome" className={chipCls(!active)}>
          {t(locale, "awesome.all")}
        </Link>
        {AGENTS.map((a) => (
          <Link
            key={a.id}
            href={`/awesome?agent=${a.id}`}
            className={chipCls(active === a.id)}
          >
            <AgentIcon id={a.id} size={14} />
            {a.name}
          </Link>
        ))}
      </div>

      {page.nodes.length === 0 ? (
        <p className="mt-16 text-center text-sm text-grey">
          {t(locale, "awesome.empty")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {page.nodes}
          <LoadMore
            key={`awesome-${active ?? "all"}-${page.nodes.length}-${page.nextCursor ?? "end"}-${locale}`}
            initialCursor={page.nextCursor}
            load={loadMoreWorksAction.bind(null, {
              awesome: true,
              agent: active ?? null,
            })}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
