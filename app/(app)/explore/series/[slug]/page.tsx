/* Explore · tutorial series page (/learn/<slug> moved here). Hero
   (shared PageHeader: series code + title + hero quote + attribution +
   verification stamp + episodes/duration) -> episode list (EP ordinal
   + title + one-liner + duration + format chips) -> discussion loop ->
   graduated works -> verification record (three blocks in
   _components/blocks.tsx). Series = the curated registry in
   src/lib/learn-series.ts; episodes = articles (kind='guide')
   (src/lib/tutorials.ts). Registered but zero published episodes ->
   notFound (no empty shells); while the section switch is off, the
   whole page shows the placeholder. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { findKbChapter } from "@/src/lib/kb-chapters";
import { findKbProduct } from "@/src/lib/kb-products";
import { findKbRole } from "@/src/lib/kb-roles";
import { findLearnSeries, isPathStale } from "@/src/lib/learn-series";
import { getSeriesTutorials, type Tutorial } from "@/src/lib/tutorials";
import { UPCOMING } from "@/src/lib/upcoming";
import PageHeader from "@/components/PageHeader";
import SoonPanel from "../../../_components/SoonPanel";
import { getSeriesDiscussion, getSeriesGraduateCards } from "../../../learn/_blocks";
import { DiscussionBlock, GraduatesBlock, VerifyLog } from "../../../learn/_components/blocks";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (UPCOMING.explore) return { title: "探索 — kimi.builders" };
  const { slug } = await params;
  const locale = await getLocale();
  const series = findLearnSeries(slug);
  return {
    title: series
      ? `${locale === "zh" ? series.title.zh : series.title.en} — kimi.builders`
      : "kimi.builders",
  };
}

function EpisodeRow({
  ep,
  index,
  zh,
}: {
  ep: Tutorial;
  index: number;
  zh: boolean;
}) {
  return (
    <article className="border-b border-line last:border-b-0">
      <Link href={`/explore/${ep.slug}`} className="group flex gap-5 py-6">
        <span className="hidden w-12 shrink-0 pt-1 font-mono text-sm font-semibold text-ui-blue sm:block">
          EP{String(ep.episode > 0 ? ep.episode : index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
            <span>{ep.payload.video ? (zh ? "视频" : "VIDEO") : zh ? "文稿" : "READ"}</span>
            {ep.payload.durationMin && (
              <span className="flex items-center gap-1 normal-case tracking-normal">
                <Clock3 size={12} aria-hidden="true" />
                {zh ? `约 ${ep.payload.durationMin} 分钟` : `~${ep.payload.durationMin} min`}
              </span>
            )}
            {ep.payload.scenario && <span>· {ep.payload.scenario}</span>}
            {ep.fallback && (
              <span className="rounded-md border border-line px-1.5 py-px normal-case tracking-normal text-paper">
                {ep.locale === "zh" ? "中文" : "EN"}
              </span>
            )}
          </p>
          <h2 className="kb-h3 mt-2 transition-colors group-hover:text-ui-blue">
            {ep.title}
          </h2>
          {ep.summary && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
              {ep.summary}
            </p>
          )}
        </div>
        <ArrowRight
          size={16}
          aria-hidden="true"
          className="mt-2 shrink-0 self-start text-grey/50 transition-colors group-hover:text-ui-blue"
        />
      </Link>
    </article>
  );
}

export default async function ExploreSeriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* Section not ready (src/lib/upcoming.ts): the detail page shows the
     placeholder too, with no DB query. */
  if (UPCOMING.explore) {
    return <SoonPanel title={t(locale, "nav.explore")} locale={locale} />;
  }
  const series = findLearnSeries(slug);
  if (!series) notFound();
  const zh = locale === "zh";
  const viewer = user ? { id: user.id, role: user.role } : null;
  const [episodes, discussion, graduates] = await Promise.all([
    getSeriesTutorials(slug, locale),
    series.discussionPostId
      ? getSeriesDiscussion(series.discussionPostId, viewer)
      : Promise.resolve(null),
    getSeriesGraduateCards(slug),
  ]);
  /* Registered but zero published episodes = no empty shell. */
  if (episodes.length === 0) notFound();

  const stale = isPathStale(series);
  const mins = episodes.reduce((n, e) => n + (e.payload.durationMin ?? 0), 0);
  const first = episodes[0];
  /* Cross-links: "covers products / fits roles" derived jointly from
     episode payloads, clickable back into the /explore lenses — the
     spine and the lenses close each other's loop. */
  const coveredProducts = [...new Set(episodes.flatMap((e) => e.payload.products ?? []))];
  const fitRoles = [...new Set(episodes.flatMap((e) => e.payload.roles ?? []))];
  /* Chapter mark: paths hang on chapters; the meta row's leading chip
     links back to the chapter view. */
  const seriesChapter = series.chapter ? findKbChapter(series.chapter) : undefined;

  return (
    <div>
      <PageHeader
        eyebrow={`— ${series.code} · ${zh ? "系列" : "SERIES"}`}
        title={
          <>
            {zh ? series.title.zh : series.title.en}
            <span className="text-ui-blue">.</span>
          </>
        }
        lede={zh ? series.summary.zh : series.summary.en}
        meta={
          <p className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.08em] text-grey">
            {seriesChapter && (
              <Link
                href={`/explore?chapter=${seriesChapter.id}`}
                className="flex items-center gap-1.5 rounded-md border border-line px-2 py-px normal-case tracking-normal text-paper/80 transition-colors hover:border-ui-blue/50 hover:text-ui-blue"
                title={zh ? seriesChapter.tagline.zh : seriesChapter.tagline.en}
              >
                {zh ? seriesChapter.zh : seriesChapter.en}
                <span aria-hidden="true">·</span>
                {zh ? seriesChapter.tagline.zh : seriesChapter.tagline.en}
              </Link>
            )}
            <span>{episodes.length} {zh ? "集" : "episodes"}</span>
            {mins > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1.5">
                  <Clock3 size={13} aria-hidden="true" />
                  {zh ? `约 ${mins} 分钟` : `~${mins} min`}
                </span>
              </>
            )}
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
                {zh ? "待重验:模型已换代,编辑尚未重走" : "re-verify pending: model generation moved on"}
              </span>
            )}
          </p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/explore/${first.slug}`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ui-blue"
            >
              {zh ? "从第一集开始 →" : "Start at EP01 →"}
            </Link>
          </div>
        }
      />

      {/* Pull quote (per the manual: quotes get the human typeface) */}
      <p className="font-human mt-8 max-w-xl text-lg leading-relaxed text-grey">
        {zh ? `「${series.tagline.zh}」` : `“${series.tagline.en}”`}
      </p>

      {/* Products covered / fitting roles (jointly derived; click through back into the lenses) */}
      {(coveredProducts.length > 0 || fitRoles.length > 0) && (
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          {coveredProducts.map((id) => {
            const p = findKbProduct(id);
            if (!p) return null;
            const Icon = p.icon;
            return (
              <Link
                key={`p-${id}`}
                href={`/explore?product=${id}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 font-mono text-xs text-grey transition-colors hover:border-ui-blue/50 hover:text-ui-blue"
              >
                <Icon size={13} aria-hidden="true" />
                {zh ? p.zh : p.en}
              </Link>
            );
          })}
          {coveredProducts.length > 0 && fitRoles.length > 0 && (
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
          )}
          {fitRoles.map((id) => {
            const r = findKbRole(id);
            if (!r) return null;
            return (
              <Link
                key={`r-${id}`}
                href={`/explore?role=${id}`}
                className="inline-flex min-h-9 items-center rounded-lg border border-line px-2.5 font-mono text-xs text-grey transition-colors hover:border-ui-blue/50 hover:text-ui-blue"
              >
                {zh ? r.zh : r.en}
              </Link>
            );
          })}
        </div>
      )}

      {/* Episode list */}
      <div className="mt-6">
        {episodes.map((ep, i) => (
          <EpisodeRow key={ep.slug} ep={ep} index={i} zh={zh} />
        ))}
      </div>

      {/* Verification log + discussion loop + graduation works */}
      <div className="mt-6">
        <VerifyLog series={series} zh={zh} />
        {discussion && <DiscussionBlock discussion={discussion} zh={zh} />}
        <GraduatesBlock series={series} graduates={graduates} zh={zh} />
      </div>

      <p className="pb-2">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, "nav.explore")}
        </Link>
      </p>
    </div>
  );
}
