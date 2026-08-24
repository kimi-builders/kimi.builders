/* Explore · article detail (monthly letters x tutorials merged).
   Letter issues and guide episodes share one page: a common hero
   (kind chip + title + summary + date/author/tags/language mark) and
   content formats through DetailTabs (fully SSR panels, ?tab=
   linkable):
   - letter: editorial review (bodyMd, shown when present) / fact sheet
     (assembled) / editorial decisions (assembled);
   - guide: text (bodyMd) / video (payload.video) / deck (a
     payload.deck link card) / resources (a payload.resources link
     list) — a missing format yields no tab.
   Permalink discipline: ?tab=facts lands directly; section poster
   buttons enter the matching panel. Legacy /blog/<slug> and
   /learn/<s>/<e> 301 here. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { compactNumber, monthLabel } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { findKbChapter } from "@/src/lib/kb-chapters";
import { getArticleRailMeta, listExploreItems } from "@/src/lib/explore";
import Avatar from "@/components/Avatar";
import { findLearnSeries } from "@/src/lib/learn-series";
import {
  getAssembledIssue,
  listLetterIssueMetas,
  type AssembledIssue,
  type LetterIssueMeta,
  type MonthlyStatsSnapshot,
} from "@/src/lib/monthly";
import { getCachedMonthlyStatsSnapshot } from "@/src/lib/monthly-stats-cache";
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
  const letter = await getAssembledIssue(slug, locale, { stats: await getCachedMonthlyStatsSnapshot() });
  if (letter) return { title: `${letter.issue.title} — kimi.builders` };
  const guide = await getTutorialBySlug(slug, locale);
  return { title: guide ? `${guide.tutorial.title} — kimi.builders` : "kimi.builders" };
}

/* Section share buttons: copy the section permalink + download its
   poster PNG. */
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

/* ---- letter: monthly issue ---- */

function LetterDetail({
  issue,
  stats,
  metas,
  initialTab,
  locale,
  canEdit,
}: {
  issue: AssembledIssue;
  /* Raw numbers for the facts visualization; the assembled issue's
     fact strings (posters, digests) come from the same snapshot. */
  stats: MonthlyStatsSnapshot;
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
  /* Facts visualization numbers: percent strings mirror buildFacts so
     panel, poster and digest always tell the same story. */
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const community = [
    { key: "members", label: zh ? "成员" : "Members", value: stats.members },
    { key: "posts", label: zh ? "帖子" : "Posts", value: stats.posts },
    { key: "works", label: zh ? "作品" : "Works", value: stats.works },
    { key: "comments", label: zh ? "评论" : "Comments", value: stats.comments },
  ];
  /* Bars scale within the community group only (one unit, one race);
     a 4% floor keeps single-digit counts visible. */
  const communityMax = Math.max(...community.map((c) => c.value), 1);
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

        {/* KPI band: token total headlines; cache rate and top model are
            the two 30-day lenses. Hairline cells (gap-px over bg-line). */}
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          <div className="bg-card p-5">
            <p className="font-mono text-[11px] tracking-[0.08em] text-grey">
              {zh ? "全站同步 TOKEN · 累计" : "TOKENS SYNCED · ALL-TIME"}
            </p>
            <p className="mt-2.5 font-mono text-3xl font-semibold tracking-tight text-paper">
              {compactNumber(stats.tokensTotal, locale)}
            </p>
          </div>
          <div className="bg-card p-5">
            <p className="font-mono text-[11px] tracking-[0.08em] text-grey">
              {zh ? "缓存命中率 · 近 30 天" : "CACHE HIT RATE · 30D"}
            </p>
            <p className="mt-2.5 font-mono text-3xl font-semibold tracking-tight text-paper">
              {stats.cacheHitRate === null ? "—" : pct(stats.cacheHitRate)}
            </p>
          </div>
          <div className="bg-card p-5">
            <p className="font-mono text-[11px] tracking-[0.08em] text-grey">
              {zh ? "TOP 模型 · 近 30 天" : "TOP MODEL · 30D"}
            </p>
            <p className="mt-2.5 truncate font-mono text-2xl font-semibold tracking-tight text-paper" title={stats.topModel?.name}>
              {stats.topModel ? `${stats.topModel.name} · ${pct(stats.topModel.share)}` : "—"}
            </p>
          </div>
        </div>

        {/* Community bars: the rail's bar recipe (h-1.5 track, blue
            fill, mono value) at reading width. */}
        <div className="mt-4 rounded-2xl border border-line p-5">
          <p className="font-mono text-[11px] tracking-[0.08em] text-grey">
            {zh ? "社区规模" : "COMMUNITY"}
          </p>
          <ul className="mt-4 space-y-3">
            {community.map((c) => (
              <li key={c.key} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-grey">{c.label}</span>
                <span className="h-1.5 min-w-0 flex-1 rounded-full bg-paper/[0.06]">
                  <span
                    className="block h-full rounded-full bg-blue"
                    style={{ width: `${Math.max((c.value / communityMax) * 100, c.value > 0 ? 4 : 0)}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-xs text-grey">
                  {c.value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 font-mono text-[10px] leading-relaxed text-grey/70">
            {zh
              ? "来源:站内用量聚合 · usage CLI 可复算 · 缺项显示 —,不编数"
              : "Source: on-site usage aggregation · reproducible via the usage CLI · gaps show —, never invented"}
          </p>
        </div>
      </div>
    ),
  });
  tabs.push({
    id: "decisions",
    label: zh ? "定夺" : "Decisions",
    panel: (
      <div className="border-b border-line py-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="kb-eyebrow">{zh ? "编辑定夺 · DECISIONS" : "DECISIONS"}</p>
          <SectionShare issue={issue} anchor="decisions" label={zh ? "定夺" : "Decisions"} locale={locale} />
        </div>
        {issue.decisions.length === 0 ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-grey">
            {zh
              ? "本月没有新的精选——定夺栏留空也是记录。"
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

  /* Prev/next issue navigation. */
  const idx = metas.findIndex((m) => m.slug === issue.slug);
  const prev = metas[idx + 1];
  const next = idx > 0 ? metas[idx - 1] : undefined;
  /* <- -> shortcut keys and the footer's issue navigation share one
     source (same direction: <- older / -> newer). */
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
        {/* Breadcrumb: back to the explore shelf, same grammar as the
            work detail's top row (back pill + truncated name). */}
        <div className="flex items-center gap-2 font-mono text-sm tracking-wider text-grey">
          <Link
            href="/explore"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-moon hover:text-paper"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            {t(locale, "nav.explore")}
          </Link>
          <span className="truncate">{issue.title}</span>
        </div>
        {/* Byline above the title (post/work-detail grammar); the meta
            row that used to sit under the title duplicated the rail's
            Type/Published/Language rows — the issue number is the one
            fact the rail lacks, it rides beside the h1. */}
        {metas[idx]?.editorHandle && (
          <div className="mt-4 flex items-center gap-3 font-mono text-xs text-grey">
            <Avatar
              url=""
              handle={metas[idx].editorHandle}
              size={20}
            />
            <Link
              href={`/u/${metas[idx].editorHandle}`}
              className="text-paper transition-colors hover:text-ui-blue"
            >
              @{metas[idx].editorHandle}
            </Link>
            <span>{monthLabel(metas[idx].publishedAt)}</span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3">
          <h1 className="kb-h1-human">{issue.title}</h1>
          <span className="mt-1 inline-flex shrink-0 items-center rounded-md border border-line px-1.5 py-px font-mono text-xs text-grey">
            ISSUE {String(issue.issue).padStart(2, "0")}
          </span>
        </div>
        <p className="kb-lede-human mt-4 max-w-2xl">{issue.summary}</p>
      </header>

      <div className="mt-8">
        <DetailTabs tabs={tabs} initialTab={initialTab} ariaLabel={zh ? "本期内容形态" : "In this issue"} />
      </div>

      {/* Footer: citation discipline + data cutoff + AI-participation disclosure */}
      <footer className="border-t border-line pt-6 text-[11px] leading-relaxed text-grey/80">
        <p>
          {zh
            ? "本刊各节均可独立引用(?tab=digest / facts / decisions)。中英双发。"
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

      {/* Prev/next issue navigation */}
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

      {/* Back lives in the top breadcrumb (work-detail grammar); this row
          keeps only the owner entry and share. */}
      <div className="mt-6 flex items-center justify-end gap-4 border-t border-line pt-6 pb-2">
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

/* ---- guide: article (the "tutorial/episode" concept is retired —
   one card per piece, no forced linkage; series are a grouping, not
   shown for now; metadata lives in the ArticleRail) ---- */

async function GuideDetail({
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
  /* Byline source: the rail-meta query is React-cached — the Article
     rail's own call dedupes with this one (no extra SQL). */
  const railMeta = await getArticleRailMeta(tutorial.slug, locale);
  const editorHandle = railMeta?.editorHandle || null;
  /* Chapter: payload.chapter ?? the owning series' registry chapter
     (the series isn't displayed; the chapter still applies). */
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
          <VideoEmbed provider={v.provider} id={v.id} title={tutorial.title} locale={locale} />
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
    /* Deck embed: HTML decks (Kimi share links, exported pages, on-site
       files) and PDFs render inline; hosts that refuse framing degrade
       to the open card below — the link is always the escape hatch. */
    const external = /^https?:\/\//i.test(deck);
    /* PDFs stay unsandboxed (viewer plugins break under sandbox and a
       PDF is inert); other cross-origin frames keep their own origin —
       scripts, forms, popups and their own storage run so interactive
       decks (e.g. Kimi share links) render fully, while the sandbox
       still blocks top-navigation hijacking. On-site paths run
       same-origin unsandboxed (our own static exports). */
    const isPdf = /\.pdf(\?|#|$)/i.test(deck);
    tabs.push({
      id: "deck",
      label: zh ? "演示稿" : "Deck",
      panel: (
        <div className="border-b border-line py-9">
          <iframe
            src={deck}
            title={tutorial.title}
            loading="lazy"
            sandbox={
              external && !isPdf
                ? "allow-scripts allow-popups allow-forms allow-same-origin"
                : undefined
            }
            className="h-[560px] w-full rounded-2xl border border-line bg-card"
          />
          <a
            href={deck}
            target="_blank"
            rel="noopener noreferrer"
            /* On-site decks are takeable assets (HTML export
               semantics); cross-origin links can't download — internal
               links only. */
            download={deck.startsWith("/") ? true : undefined}
            className="group mt-4 flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-ui-blue/60"
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
    /* Kind grouping: official/recommended/prompt/SKILLS/source file —
       what builders collect most, each in its place; legacy payloads
       without a kind all fall into "recommended", and a single group
       shows no header (nearly the old render, zero migration). */
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
        {/* Breadcrumb: back to the explore shelf, same grammar as the
            work detail's top row (back pill + truncated name). */}
        <div className="flex items-center gap-2 font-mono text-sm tracking-wider text-grey">
          <Link
            href="/explore"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-moon hover:text-paper"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            {t(locale, "nav.explore")}
          </Link>
          <span className="truncate">{tutorial.title}</span>
        </div>
        {/* Byline above the title, same grammar as the letter/post/work
            details; the old meta row duplicated the rail's
            type/date/language — the chapter chip stays beside the h1
            (the rail is >=xl only; on smaller screens it was the last
            place the chapter lived). */}
        {editorHandle && (
          <div className="mt-4 flex items-center gap-3 font-mono text-xs text-grey">
            <Avatar url="" handle={editorHandle} size={20} />
            <Link
              href={`/u/${editorHandle}`}
              className="text-paper transition-colors hover:text-ui-blue"
            >
              @{editorHandle}
            </Link>
            <span>{monthLabel(tutorial.publishedAt)}</span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3">
          <h1 className="kb-h1">{tutorial.title}</h1>
          {chapter && (
            <Link
              href={`/explore?chapter=${chapter.id}`}
              className="mt-1 inline-flex shrink-0 items-center rounded-md border border-line px-1.5 py-px font-mono text-xs text-grey transition-colors hover:border-ui-blue/50 hover:text-ui-blue"
            >
              {zh ? chapter.zh : chapter.en}
            </Link>
          )}
        </div>
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

      {/* Back lives in the top breadcrumb (work-detail grammar); this row
          keeps only the owner entry and share. */}
      <div className="mt-6 flex items-center justify-end gap-4 border-t border-line pt-6 pb-2">
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

  /* Letters first, guides as fallback. The snapshot feeds both the
     assembled facts (posters/digests) and the facts visualization, so
     every surface shows identical numbers. */
  const stats = await getCachedMonthlyStatsSnapshot();
  const letter = await getAssembledIssue(slug, locale, { stats });
  if (letter) {
    const metas = await listLetterIssueMetas(locale);
    return (
      <LetterDetail
        issue={letter.issue}
        stats={stats}
        metas={metas}
        initialTab={rawTab}
        locale={locale}
        canEdit={canEdit}
      />
    );
  }
  const guide = await getTutorialBySlug(slug, locale);
  if (!guide) notFound();
  /* Guides have no issues: <- -> walk the full list (new -> old) for
     neighbors, same direction as letters (<- older / -> newer); the
     single query goes through React cache, deduped per request. */
  const guideList = await listExploreItems(locale);
  const guideIdx = guideList.findIndex((i) => i.slug === slug);
  const guidePrev = guideIdx >= 0 ? guideList[guideIdx + 1] : undefined;
  const guideNext = guideIdx > 0 ? guideList[guideIdx - 1] : undefined;
  /* Format preference fallback order: an explicit ?tab= wins -> the
     kb_fmt cookie (only when this piece has that format) -> the first
     tab; the cookie is written by DetailTabs' remember. */
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
