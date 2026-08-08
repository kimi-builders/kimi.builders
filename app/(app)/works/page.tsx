/* 作品库 /works:成员作品墙(截图卡片,双列网格)+ 提交入口。
   卡片:截图(无截图给占位块)→ 名称/介绍 → 标签 → 作者行(站内作者链主页,
   awesome 外部条目用 author_label);自己的作品带编辑/删除(客户端组件)。
   数据全部来自 works 表,awesome 导入条目后同墙展示。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Rocket, SquarePen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getWorks } from "@/src/lib/works";
import WorkOwnerActions from "./_components/WorkOwnerActions";

export const metadata: Metadata = { title: "作品库 — kimi.builders" };

export default async function WorksPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const works = await getWorks();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
          <Rocket size={17} />
          {t(locale, "nav.works")}
        </h1>
        {user && (
          <Link
            href="/works/new"
            className="flex items-center gap-2 border border-blue px-4 py-1.5 font-mono text-xs text-blue transition-colors hover:bg-blue hover:text-bg"
          >
            <SquarePen size={13} />
            {t(locale, "works.submit")}
          </Link>
        )}
      </div>

      {works.length === 0 ? (
        <p className="mt-16 text-center text-sm leading-relaxed text-grey">
          {t(locale, "works.empty")}
          {!user && (
            <>
              <br />
              {t(locale, "works.loginRequired")}
              <a
                href="/api/auth/github"
                className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
              >
                GitHub
              </a>
              <a
                href="/api/auth/google"
                className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue"
              >
                Google
              </a>
            </>
          )}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {works.map((w) => (
            <article
              key={w.id}
              className="flex flex-col border border-line bg-card transition-colors hover:border-paper/20"
            >
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
                  {w.handle ? (
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
                    <span className="truncate">{w.authorLabel}</span>
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
                    {user && w.userId === user.id && (
                      <WorkOwnerActions workId={w.id} locale={locale} />
                    )}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
