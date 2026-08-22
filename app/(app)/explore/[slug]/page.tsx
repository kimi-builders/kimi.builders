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
import { cookies } from "next/headers";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { monthLabel } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { findKbChapter } from "@/src/lib/kb-chapters";
import { listExploreItems } from "@/src/lib/explore";
import { findLearnSeries } from "@/src/lib/learn-series";
import {
  getAssembledIssue,
  listLetterIssueMetas,
  type AssembledIssue,
  type LetterIssueMeta,
} from "@/src/lib/monthly";
import {
  getTutorialBySlug,
  GUIDE_RESOURCE_KINDS,
  type GuideResourceKind,
  type TutorialDetail,
} from "@/src/lib/tutorials";
import { UPCOMING } from "@/src/lib/upcoming";
import DetailTabs, { type DetailTab } from "@/components/DetailTabs";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import VideoEmbed from "@/components/VideoEmbed";
import SoonPanel from "../../_components/SoonPanel";
import { ArticleKeys } from "../_components/ExploreKeys";
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
        <div className="md-longform border-b border-line py-9">
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
  /* ←→ 快捷键与页脚期次导航同一事实来源(方向一致:←更早 / →更新) */
  const issueKeys = (
    <ArticleKeys
      prev={prev ? `/explore/${prev.slug}` : undefined}
      next={next ? `/explore/${next.slug}` : undefined}
    />
  );

  const disclosure = issue.aiDisclosure;
  const disclosureRows = disclosure
    ? (Object.entries(disclosure) as [string, string][])
    : [];

  return (
    <article>
      {issueKeys}
      <header>
        <p className="kb-eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>— {zh ? "月刊评鉴" : "MONTHLY"} · ISSUE {String(issue.issue).padStart(2, "0")} · {issue.month}</span>
          {metas[idx]?.fallback && (
            <span className="rounded-md border border-line px-1.5 py-px normal-case tracking-normal text-paper">
              {t(locale, metas[idx].locale === "zh" ? "art.langZh" : "art.langEn")}
            </span>
          )}
        </p>
        <h1 className="kb-h1-human mt-3">{issue.title}</h1>
        <p className="kb-lede-human mt-4 max-w-2xl">{issue.summary}</p>
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
          <Link href={`/explore/${prev.slug}`} className="kb-navlink group min-w-0">
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
          <Link href={`/explore/${next.slug}`} className="kb-navlink group min-w-0 text-right">
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
        <div className="flex items-center gap-4">
          {canEdit && (
            <Link
              href={`/blog/admin/${issue.slug}/edit?locale=${metas[idx]?.locale ?? locale}`}
              className="font-mono text-[11px] text-grey transition-colors hover:text-ui-blue"
            >
              {t(locale, "post.edit")}
            </Link>
          )}
          <ShareButton path={`/explore/${issue.slug}`} title={issue.title} locale={locale} />
        </div>
      </div>
    </article>
  );
}

/* ---- guide:文章(20260822 去「教程/集」概念——一篇一卡,无强关联;
   系列 = 内容组合,现阶段不显示;元数据在右栏 ArticleRail) ---- */

function GuideDetail({
  tutorial,
  initialTab,
  locale,
  canEdit,
}: {
  tutorial: TutorialDetail;
  initialTab?: string;
  locale: "zh" | "en";
  canEdit: boolean;
}) {
  const zh = locale === "zh";
  /* 章:payload.chapter ?? 所属系列的注册表章(系列不显示,章仍生效) */
  const seriesChapterSlug = tutorial.series
    ? findLearnSeries(tutorial.series)?.chapter
    : undefined;
  const chapterSlug = tutorial.payload.chapter ?? seriesChapterSlug;
  const chapter = chapterSlug ? findKbChapter(chapterSlug) : undefined;

  const tabs: DetailTab[] = [];
  if (tutorial.bodyMd) {
    tabs.push({
      id: "read",
      label: zh ? "文稿" : "Read",
      panel: (
        <div className="md-longform border-b border-line py-9">
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
            /* 站内演示稿是可带走的资产(HTML 导出语义);外链跨域
               download 无效,只给内链 */
            download={deck.startsWith("/") ? true : undefined}
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
    /* 分型分组(20260821):官方/推荐/提示词/SKILLS/源文件——builder 最会收
       的东西各归各位;无 kind 的存量 payload 全落「推荐资源」,单组时不
       出组头(与旧渲染几乎同形,零迁移)。 */
    const kindLabel = (k: GuideResourceKind) =>
      ({
        official: zh ? "官方链接" : "Official",
        resource: zh ? "推荐资源" : "Recommended",
        prompt: zh ? "提示词" : "Prompts",
        skill: zh ? "SKILLS" : "Skills",
        file: zh ? "源文件" : "Source files",
      })[k];
    const groups = GUIDE_RESOURCE_KINDS.map((k) => ({
      kind: k,
      list: resources.filter((r) => (r.kind ?? "resource") === k),
    })).filter((g) => g.list.length > 0);
    const legacyFlat = groups.length === 1 && groups[0].kind === "resource";
    tabs.push({
      id: "resources",
      label: zh ? "资源" : "Resources",
      panel: (
        <div className="border-b border-line py-9">
          {groups.map((g) => (
            <section key={g.kind} className={legacyFlat ? "" : "mb-6 last:mb-0"}>
              {!legacyFlat && (
                <p className="kb-eyebrow border-b border-line pb-3">{kindLabel(g.kind)}</p>
              )}
              <ul>
                {g.list.map((r) => {
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
            </section>
          ))}
        </div>
      ),
    });
  }

  return (
    <article>
      <header>
        <p className="kb-eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            — {zh ? "文章" : "ARTICLE"}
            {chapter ? ` · ${zh ? chapter.zh : chapter.en}` : ""}
            {` · ${monthLabel(tutorial.publishedAt)}`}
          </span>
          {tutorial.fallback && (
            <span className="rounded-md border border-line px-1.5 py-px normal-case tracking-normal text-paper">
              {tutorial.locale === "zh" ? "中文" : "EN"}
            </span>
          )}
        </p>
        <h1 className="kb-h1 mt-3">{tutorial.title}</h1>
        {tutorial.summary && <p className="kb-lede mt-4 max-w-2xl">{tutorial.summary}</p>}
      </header>

      <div className="mt-8">
        {tabs.length > 0 ? (
          <DetailTabs tabs={tabs} initialTab={initialTab} remember ariaLabel={zh ? "本篇内容形态" : "In this piece"} />
        ) : (
          <p className="border-y border-line py-9 text-sm leading-relaxed text-grey">
            {zh ? "本篇还没有内容。" : "Nothing here yet."}
          </p>
        )}
      </div>

      {tutorial.payload.aiNote && (
        <p className="mt-6 text-[11px] leading-relaxed text-grey/80">
          {zh ? "AI 参与披露:" : "AI involvement disclosed: "}
          {tutorial.payload.aiNote}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-6 pb-2">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, "nav.explore")}
        </Link>
        <div className="flex items-center gap-4">
          {canEdit && (
            <Link
              href={`/blog/admin/${tutorial.slug}/edit?locale=${tutorial.locale}`}
              className="font-mono text-[11px] text-grey transition-colors hover:text-ui-blue"
            >
              {t(locale, "post.edit")}
            </Link>
          )}
          <ShareButton
            path={`/explore/${tutorial.slug}`}
            title={tutorial.title}
            locale={locale}
          />
        </div>
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
  /* 指南无期次概念:←→ 沿全列表(新→旧)取上下篇,方向与 letter 一致
     (←更早 / →更新);单查询进 React cache,同请求去重 */
  const guideList = await listExploreItems(locale);
  const guideIdx = guideList.findIndex((i) => i.slug === slug);
  const guidePrev = guideIdx >= 0 ? guideList[guideIdx + 1] : undefined;
  const guideNext = guideIdx > 0 ? guideList[guideIdx - 1] : undefined;
  /* 形态偏好回落序(20260821):显式 ?tab= 最优先 → kb_fmt cookie(该集
     有此形态才生效)→ 第一个 tab;cookie 由 DetailTabs 的 remember 写入 */
  const preferredFormat = (await cookies()).get("kb_fmt")?.value;
  const guideTabIds = new Set<string>([
    ...(guide.tutorial.bodyMd ? ["read"] : []),
    ...(guide.tutorial.payload.video ? ["video"] : []),
    ...(guide.tutorial.payload.deck ? ["deck"] : []),
    ...(guide.tutorial.payload.resources?.length ? ["resources"] : []),
  ]);
  const guideTab =
    rawTab && guideTabIds.has(rawTab)
      ? rawTab
      : preferredFormat && guideTabIds.has(preferredFormat)
        ? preferredFormat
        : undefined;
  return (
    <>
      <ArticleKeys
        prev={guidePrev ? `/explore/${guidePrev.slug}` : undefined}
        next={guideNext ? `/explore/${guideNext.slug}` : undefined}
      />
      <GuideDetail
        tutorial={guide.tutorial}
        initialTab={guideTab}
        locale={locale}
        canEdit={canEdit}
      />
    </>
  );
}
