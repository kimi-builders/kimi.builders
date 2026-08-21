/* 探索(Explore)· 文章详情(20260821 月刊 × 教程合并)
   月刊期次(letter)与教程集(guide)同构一页:共享 hero(分类 chip + 题名 +
   摘要 + 日期/署名/标签/语言标),内容形态走 DetailTabs(全 SSR 面板 +
   ?tab= 可链接):
   · letter:本月评鉴(bodyMd,有才显示)/ 事实盘点(组装)/ 编辑定夺(组装);
   · guide:文稿(bodyMd)/ 视频(payload.video)/ 演示稿(payload.deck 链接卡)/
     资源(payload.resources 链接列表)——没有该形态不出 tab。
   permalink 纪律:?tab=facts 直达;分节海报按钮进对应面板。
   旧路由 /blog/<slug>、/learn/<s>/<e> 301 到此页。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock3, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { monthLabel } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { findLearnSeries, isPathStale } from "@/src/lib/learn-series";
import {
  getAssembledIssue,
  listLetterIssueMetas,
  type AssembledIssue,
  type LetterIssueMeta,
} from "@/src/lib/monthly";
import {
  episodeNeighbors,
  getTutorialBySlug,
  type Tutorial,
  type TutorialDetail,
} from "@/src/lib/tutorials";
import { UPCOMING } from "@/src/lib/upcoming";
import DetailTabs, { type DetailTab } from "@/components/DetailTabs";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import VideoEmbed from "@/components/VideoEmbed";
import SoonPanel from "../../_components/SoonPanel";
import { decisionChip } from "../../blog/_components/chips";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (UPCOMING.explore) return { title: "探索 — kimi.builders" };
  const { slug } = await params;
  const locale = await getLocale(await getSessionUser());
  const letter = await getAssembledIssue(slug, locale);
  if (letter) return { title: `${letter.issue.title} — kimi.builders` };
  const guide = await getTutorialBySlug(slug, locale);
  return { title: guide ? `${guide.tutorial.title} — kimi.builders` : "kimi.builders" };
}

/* 分节分享小按钮:复制该节 permalink + 下载该节海报 PNG */
function SectionShare({
  issue,
  anchor,
  label,
  locale,
}: {
  issue: AssembledIssue;
  anchor: "facts" | "decisions";
  label: string;
  locale: "zh" | "en";
}) {
  return (
    <ShareButton
      path={`/explore/${issue.slug}?tab=${anchor}`}
      title={`${issue.title} · ${label}`}
      locale={locale}
      posterHref={`/api/share/letter/${issue.slug}?section=${anchor}`}
      posterSurface="letter"
    />
  );
}

/* ---- letter:月刊期次 ---- */

function LetterDetail({
  issue,
  metas,
  initialTab,
  locale,
  canEdit,
}: {
  issue: AssembledIssue;
  metas: LetterIssueMeta[];
  initialTab?: string;
  locale: "zh" | "en";
  canEdit: boolean;
}) {
  const zh = locale === "zh";
  const tabs: DetailTab[] = [];
  if (issue.bodyMd) {
    tabs.push({
      id: "digest",
      label: zh ? "本月评鉴" : "The review",
      panel: (
        <div className="border-b border-line py-9">
          <Markdown source={issue.bodyMd} />
        </div>
      ),
    });
  }
  tabs.push({
    id: "facts",
    label: zh ? "事实盘点" : "Facts",
    panel: (
      <div className="border-b border-line py-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="kb-eyebrow">{zh ? "事实盘点 · FACTS" : "FACTS"}</p>
          <SectionShare issue={issue} anchor="facts" label={zh ? "事实盘点" : "Facts"} locale={locale} />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-grey">
          {zh
            ? "来自站内用量聚合的月度快照,口径可复算(usage CLI 开源);缺项显示「—」,不编数。"
            : "A monthly snapshot from on-site usage aggregation, reproducible via the open-source usage CLI; gaps show “—”, never invented."}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {issue.facts.map((f) => (
            <div key={f.label} className="border-l-2 border-ui-blue/60 pl-3">
              <p className="break-all font-mono text-2xl font-semibold leading-tight tracking-tight text-paper">{f.value}</p>
              <p className="mt-2 text-[11px] leading-snug text-grey">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  });
  tabs.push({
    id: "decisions",
    label: zh ? "编辑定夺" : "Decisions",
    panel: (
      <div className="border-b border-line py-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="kb-eyebrow">{zh ? "编辑定夺 · DECISIONS" : "DECISIONS"}</p>
          <SectionShare issue={issue} anchor="decisions" label={zh ? "编辑定夺" : "Decisions"} locale={locale} />
        </div>
        {issue.decisions.length === 0 ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-grey">
            {zh
              ? "本月编辑没有拍板新的精选——定夺栏留空也是记录。"
              : "No new picks this month — an empty decisions column is itself the record."}
          </p>
        ) : (
          <div className="mt-3">
            {issue.decisions.map((d, i) => (
              <div key={`${i}-${d.kind}-${d.title}`} className="border-b border-line py-5 last:border-b-0">
                <div className="flex flex-wrap items-center gap-3">
                  {decisionChip(d.kind, zh)}
                  <span className="text-[15px] font-semibold text-paper">
                    {d.href ? (
                      /^https?:\/\//.test(d.href) ? (
                        <a href={d.href} target="_blank" rel="noreferrer" className="transition-colors hover:text-ui-blue">
                          {d.title}
                          <ArrowUpRight size={13} className="ml-1 inline shrink-0 align-[-2px] text-grey" aria-hidden="true" />
                        </a>
                      ) : (
                        <Link href={d.href} className="transition-colors hover:text-ui-blue">
                          {d.title}
                        </Link>
                      )
                    ) : (
                      d.title
                    )}
                  </span>
                  {d.authorHandle && (
                    <span className="ml-auto font-mono text-[11px] text-grey">
                      {zh ? "作者" : "by"}{" "}
                      {d.authorHref ? (
                        <Link href={d.authorHref} className="text-paper transition-colors hover:text-ui-blue">
                          @{d.authorHandle}
                        </Link>
                      ) : (
                        d.authorHandle
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">{d.note}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-grey/80">
                  {d.editorHandle && (
                    <span>
                      {zh ? "定夺" : "decided by"}{" "}
                      <Link href={`/u/${d.editorHandle}`} className="text-grey transition-colors hover:text-ui-blue">
                        @{d.editorHandle}
                      </Link>
                    </span>
                  )}
                  {d.rulingUrl && (
                    <Link href={d.rulingUrl} className="text-ui-blue transition-opacity hover:opacity-75">
                      {zh ? "公示全文 →" : "Full ruling →"}
                    </Link>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  });

  /* 期次前后导航 */
  const idx = metas.findIndex((m) => m.slug === issue.slug);
  const prev = metas[idx + 1];
  const next = idx > 0 ? metas[idx - 1] : undefined;

  const disclosure = issue.aiDisclosure;
  const disclosureRows = disclosure
    ? (Object.entries(disclosure) as [string, string][])
    : [];

  return (
    <article>
      <header>
        <p className="kb-eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>— {zh ? "月刊评鉴" : "MONTHLY"} · ISSUE {String(issue.issue).padStart(2, "0")} · {issue.month}</span>
          {metas[idx]?.fallback && (
            <span className="rounded-md border border-line px-1.5 py-px normal-case tracking-normal text-paper">
              {t(locale, metas[idx].locale === "zh" ? "art.langZh" : "art.langEn")}
            </span>
          )}
        </p>
        <h1 className="kb-h1 mt-3">{issue.title}</h1>
        <p className="kb-lede mt-4 max-w-2xl">{issue.summary}</p>
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-grey">
          <span>
            {zh ? "主编" : "ed."}{" "}
            <Link href={`/u/${issue.editorHandle}`} className="normal-case text-paper transition-colors hover:text-ui-blue">
              @{issue.editorHandle}
            </Link>
          </span>
          <span aria-hidden="true">·</span>
          <span>{zh ? "评鉴手写" : "hand-picked"}</span>
          {canEdit && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/blog/admin/${issue.slug}/edit?locale=${metas[idx]?.locale ?? locale}`}
                className="normal-case tracking-normal text-grey transition-colors hover:text-ui-blue"
              >
                {t(locale, "post.edit")}
              </Link>
            </>
          )}
        </p>
      </header>

      <div className="mt-8">
        <DetailTabs tabs={tabs} initialTab={initialTab} ariaLabel={zh ? "本期内容形态" : "In this issue"} />
      </div>

      {/* 页脚:引用纪律 + 数据截止 + AI 参与披露 */}
      <footer className="border-t border-line pt-6 text-[11px] leading-relaxed text-grey/80">
        <p>
          {zh
            ? "本刊各节均可独立引用(?tab=digest / facts / decisions)。中英双发,英文版是国际 builder 圈看中文 Kimi 生态的窗口。"
            : "Every section is independently citable (?tab=digest / facts / decisions). Published in both languages."}
        </p>
        {disclosureRows.length > 0 && (
          <p className="mt-2">
            {zh ? "AI 参与披露:" : "AI involvement disclosed: "}
            {disclosureRows.map(([key, note], i) => (
              <span key={key}>
                {i > 0 && (zh ? ";" : "; ")}
                {key}
                {zh ? "——" : " — "}
                {note}
              </span>
            ))}
          </p>
        )}
      </footer>

      {/* 期次前后导航 */}
      <nav
        aria-label={zh ? "期次导航" : "Issue navigation"}
        className="mt-6 flex items-stretch justify-between gap-4 border-t border-line pt-6"
      >
        {prev ? (
          <Link href={`/explore/${prev.slug}`} className="group min-w-0">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors group-hover:text-ui-blue">
              <ArrowLeft size={13} aria-hidden="true" />
              {zh ? "上一期" : "OLDER"}
            </span>
            <span className="mt-1.5 block truncate font-mono text-[11px] text-paper/80 transition-colors group-hover:text-ui-blue">
              ISSUE {String(prev.issue).padStart(2, "0")} · {prev.month}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/explore/${next.slug}`} className="group min-w-0 text-right">
            <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] text-grey transition-colors group-hover:text-ui-blue">
              {zh ? "下一期" : "NEWER"}
              <ArrowRight size={13} aria-hidden="true" />
            </span>
            <span className="mt-1.5 block truncate font-mono text-[11px] text-paper/80 transition-colors group-hover:text-ui-blue">
              ISSUE {String(next.issue).padStart(2, "0")} · {next.month}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-6 pb-2">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, "nav.explore")}
        </Link>
        <ShareButton path={`/explore/${issue.slug}`} title={issue.title} locale={locale} />
      </div>
    </article>
  );
}

/* ---- guide:教程集 ---- */

function GuideDetail({
  tutorial,
  seriesTutorials,
  initialTab,
  locale,
  canEdit,
}: {
  tutorial: TutorialDetail;
  seriesTutorials: Tutorial[];
  initialTab?: string;
  locale: "zh" | "en";
  canEdit: boolean;
}) {
  const zh = locale === "zh";
  const series = tutorial.series ? findLearnSeries(tutorial.series) : undefined;
  const stale = series ? isPathStale(series) : false;

  const tabs: DetailTab[] = [];
  if (tutorial.bodyMd) {
    tabs.push({
      id: "read",
      label: zh ? "文稿" : "Read",
      panel: (
        <div className="border-b border-line py-9">
          <Markdown source={tutorial.bodyMd} />
        </div>
      ),
    });
  }
  if (tutorial.payload.video) {
    const v = tutorial.payload.video;
    const watchUrl =
      v.provider === "bilibili"
        ? `https://www.bilibili.com/video/${v.id}`
        : `https://www.youtube.com/watch?v=${v.id}`;
    tabs.push({
      id: "video",
      label: zh ? "视频" : "Video",
      panel: (
        <div className="border-b border-line py-9">
          <VideoEmbed provider={v.provider} id={v.id} title={tutorial.title} />
          <p className="mt-4">
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-ui-blue transition-opacity hover:opacity-80"
            >
              {v.provider === "bilibili"
                ? zh ? "在 B 站观看 →" : "Watch on bilibili →"
                : zh ? "在 YouTube 观看 →" : "Watch on YouTube →"}
            </a>
          </p>
        </div>
      ),
    });
  }
  if (tutorial.payload.deck) {
    const deck = tutorial.payload.deck;
    tabs.push({
      id: "deck",
      label: zh ? "演示稿" : "Deck",
      panel: (
        <div className="border-b border-line py-9">
          <a
            href={deck}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-ui-blue/60"
          >
            <span>
              <span className="block text-sm font-semibold text-paper transition-colors group-hover:text-ui-blue">
                {zh ? "打开演示稿" : "Open the deck"}
              </span>
              <span className="mt-1 block font-mono text-[11px] text-grey">{deck}</span>
            </span>
            <ArrowUpRight size={16} className="shrink-0 text-grey transition-colors group-hover:text-ui-blue" aria-hidden="true" />
          </a>
        </div>
      ),
    });
  }
  if (tutorial.payload.resources?.length) {
    const resources = tutorial.payload.resources;
    tabs.push({
      id: "resources",
      label: zh ? "资源" : "Resources",
      panel: (
        <div className="border-b border-line py-9">
          <ul>
            {resources.map((r) => {
              const external = /^https?:\/\//.test(r.url);
              return (
                <li key={r.url} className="border-b border-line py-3.5 last:border-b-0">
                  {external ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-1.5 text-sm font-medium text-paper transition-colors hover:text-ui-blue"
                    >
                      {r.label}
                      <ArrowUpRight size={13} className="shrink-0 text-grey" aria-hidden="true" />
                    </a>
                  ) : (
                    <Link href={r.url} className="text-sm font-medium text-paper transition-colors hover:text-ui-blue">
                      {r.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ),
    });
  }

  const { prev, next } = episodeNeighbors(seriesTutorials, tutorial.slug);
  const epNo = Math.max(seriesTutorials.findIndex((e) => e.slug === tutorial.slug) + 1, 1);

  return (
    <article>
      {/* 面包屑:← 系列(在册才显示) */}
      {series && (
        <p className="mb-6">
          <Link
            href={`/explore/series/${series.slug}`}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors hover:text-paper"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            {zh ? series.title.zh : series.title.en}
          </Link>
        </p>
      )}

      <header>
        <p className="kb-eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            — {zh ? "教程" : "TUTORIAL"}
            {series ? ` · ${series.code} · EP${String(epNo).padStart(2, "0")}` : ""}
          </span>
          {tutorial.payload.durationMin && (
            <span className="flex items-center gap-1 normal-case tracking-normal">
              <Clock3 size={12} aria-hidden="true" />
              {zh ? `约 ${tutorial.payload.durationMin} 分钟` : `~${tutorial.payload.durationMin} min`}
            </span>
          )}
          {tutorial.payload.scenario && <span>· {tutorial.payload.scenario}</span>}
          {tutorial.fallback && (
            <span className="rounded-md border border-line px-1.5 py-px normal-case tracking-normal text-paper">
              {tutorial.locale === "zh" ? "中文" : "EN"}
            </span>
          )}
        </p>
        <h1 className="kb-h1 mt-3">{tutorial.title}</h1>
        {tutorial.summary && <p className="kb-lede mt-4 max-w-2xl">{tutorial.summary}</p>}
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-grey">
          <span>{monthLabel(tutorial.publishedAt)}</span>
          {series && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck
                  size={13}
                  className={stale ? "text-status-warn-fg" : "text-status-ok-fg"}
                  aria-hidden="true"
                />
                @{series.editorHandle} {zh ? "验证" : "verified"} · {series.verifiedModel} · {series.verifiedAt}
              </span>
              {stale && (
                <span className="rounded-md border border-status-warn/40 px-1.5 py-px normal-case tracking-normal text-status-warn-fg">
                  {zh ? "待重验" : "re-verify pending"}
                </span>
              )}
            </>
          )}
          {canEdit && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/blog/admin/${tutorial.slug}/edit?locale=${tutorial.locale}`}
                className="normal-case tracking-normal text-grey transition-colors hover:text-ui-blue"
              >
                {t(locale, "post.edit")}
              </Link>
            </>
          )}
        </p>
        {tutorial.payload.tags && tutorial.payload.tags.length > 0 && (
          <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-grey/80">
            {tutorial.payload.tags.map((tag) => (
              <Link key={tag} href={`/explore?view=tags&tag=${encodeURIComponent(tag)}`} className="transition-colors hover:text-ui-blue">
                #{tag}
              </Link>
            ))}
          </p>
        )}
      </header>

      <div className="mt-8">
        {tabs.length > 0 ? (
          <DetailTabs tabs={tabs} initialTab={initialTab} ariaLabel={zh ? "本集内容形态" : "In this episode"} />
        ) : (
          <p className="border-y border-line py-9 text-sm leading-relaxed text-grey">
            {zh ? "本集还没有内容。" : "Nothing here yet."}
          </p>
        )}
      </div>

      {tutorial.payload.aiNote && (
        <p className="mt-6 text-[11px] leading-relaxed text-grey/80">
          {zh ? "AI 参与披露:" : "AI involvement disclosed: "}
          {tutorial.payload.aiNote}
        </p>
      )}

      {/* 上/下集导航(系列内) */}
      {seriesTutorials.length > 1 && (
        <nav
          aria-label={zh ? "集导航" : "Episode navigation"}
          className="mt-6 flex items-stretch justify-between gap-4 border-t border-line pt-6"
        >
          {prev ? (
            <Link href={`/explore/${prev.slug}`} className="group min-w-0">
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors group-hover:text-ui-blue">
                <ArrowLeft size={13} aria-hidden="true" />
                {zh ? "上一集" : "PREVIOUS"}
              </span>
              <span className="mt-1.5 block truncate font-mono text-[11px] text-paper/80 transition-colors group-hover:text-ui-blue">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/explore/${next.slug}`} className="group min-w-0 text-right">
              <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] text-grey transition-colors group-hover:text-ui-blue">
                {zh ? "下一集" : "NEXT"}
                <ArrowRight size={13} aria-hidden="true" />
              </span>
              <span className="mt-1.5 block truncate font-mono text-[11px] text-paper/80 transition-colors group-hover:text-ui-blue">
                {next.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-6 pb-2">
        <Link
          href={series ? `/explore/series/${series.slug}` : "/explore"}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {series ? (zh ? "返回系列" : "Back to series") : t(locale, "nav.explore")}
        </Link>
        <ShareButton
          path={`/explore/${tutorial.slug}`}
          title={tutorial.title}
          locale={locale}
        />
      </div>
    </article>
  );
}

export default async function ExploreDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (UPCOMING.explore) {
    return <SoonPanel title={t(locale, "nav.explore")} locale={locale} />;
  }
  const canEdit = !!user && canModerate(user.role);

  /* letter 优先,guide 回落 */
  const letter = await getAssembledIssue(slug, locale);
  if (letter) {
    const metas = await listLetterIssueMetas(locale);
    return (
      <LetterDetail
        issue={letter.issue}
        metas={metas}
        initialTab={rawTab}
        locale={locale}
        canEdit={canEdit}
      />
    );
  }
  const guide = await getTutorialBySlug(slug, locale);
  if (!guide) notFound();
  return (
    <GuideDetail
      tutorial={guide.tutorial}
      seriesTutorials={guide.seriesTutorials}
      initialTab={rawTab}
      locale={locale}
      canEdit={canEdit}
    />
  );
}
