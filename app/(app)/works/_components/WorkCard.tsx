/* 作品卡片:/works(成员作品墙)与 /awesome(全来源)共用。
   截图(无图占位)→ 名称/介绍 → Agent 徽章(lobehub 图标)→ 标签 →
   作者行(站内作者链主页;awesome 条目用 author_label);自己的条目带编辑/删除。 */
import Link from "next/link";
import { ExternalLink, Rocket } from "lucide-react";
import { agentName } from "@/src/lib/agents";
import { t, type Locale } from "@/src/lib/i18n";
import type { WorkRow } from "@/src/lib/works";
import AgentIcon from "@/components/AgentIcon";
import WorkOwnerActions from "./WorkOwnerActions";

export default function WorkCard({
  work: w,
  locale,
  meId,
}: {
  work: WorkRow;
  locale: Locale;
  meId: number | null;
}) {
  return (
    <article className="flex flex-col border border-line bg-card transition-colors hover:border-paper/20">
      {w.screenshotUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={w.screenshotUrl}
          alt={w.name}
          className="aspect-video w-full border-b border-line object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center border-b border-line text-grey/40">
          <Rocket size={28} />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <h2 className="font-medium leading-snug text-paper">{w.name}</h2>
        {w.tagline && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-grey">
            {w.tagline}
          </p>
        )}
        {w.agents.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-grey">
            {w.agents.map((a) => (
              <span key={a} title={agentName(a)} className="inline-flex">
                <AgentIcon id={a} size={15} />
              </span>
            ))}
          </div>
        )}
        {w.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {w.tags.map((tag) => (
              <span
                key={tag}
                className="border border-line px-1.5 py-px font-mono text-[10px] text-grey"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-3 font-mono text-[11px] text-grey">
          {w.source === "awesome" && w.authorLabel ? (
            <span className="truncate">
              {t(locale, "awesome.by", { name: w.authorLabel })}
            </span>
          ) : w.handle ? (
            <Link
              href={`/u/${w.handle}`}
              className="flex min-w-0 items-center gap-1.5 text-grey transition-colors hover:text-blue"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={w.avatarUrl ?? ""}
                alt=""
                className="h-4 w-4 rounded-full"
              />
              <span className="truncate text-paper">@{w.handle}</span>
            </Link>
          ) : (
            <span className="truncate">
              {t(locale, "awesome.by", { name: w.authorLabel })}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-3">
            {w.url && (
              <a
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
                title={t(locale, "works.visit")}
                className="inline-flex items-center gap-1 transition-colors hover:text-blue"
              >
                <ExternalLink size={12} />
                {t(locale, "works.visit")}
              </a>
            )}
            {w.repoUrl && (
              <a
                href={w.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={t(locale, "works.repo")}
                className="inline-flex items-center gap-1 transition-colors hover:text-blue"
              >
                {t(locale, "works.repo")}
              </a>
            )}
            {meId !== null && w.userId === meId && (
              <WorkOwnerActions workId={w.id} locale={locale} />
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
