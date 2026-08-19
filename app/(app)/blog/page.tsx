/* 月刊总览 v4(20260921 产品转向:AI 月刊)
   初期定位 = AI 月刊:
   Kimi 生态与更广阔的 AI 世界里值得读的新闻、资源、知识与作品,编辑署名。
   「给官方的反馈信」层下线(官方渠道无回音,再议)。
   新三层:01 本月评鉴(编辑手写长文)→ 02 事实盘点(可验证快照)→
   03 编辑定夺(featured + 治理公示);层色 蓝/翡翠/琥珀 贯穿。
   页面结构:hero(右侧「每期三层」卡,行锚最新期分节)→ 最新期三层预览
   → 运作方式三条纪律 → 往期 session-row 行式档案。
   数据为真实组装(src/lib/monthly.ts);一封未发 = 诚实的「首期筹备中」空态。
   板块开关未就绪时整页换「正在路上」(src/lib/upcoming.ts)。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  getBlogOverview,
  type AssembledIssue,
  type LetterIssueMeta,
} from "@/src/lib/monthly";
import { UPCOMING } from "@/src/lib/upcoming";
import SoonPanel from "../_components/SoonPanel";
import { decisionChip } from "./_components/chips";

export const metadata: Metadata = {
  title: "月刊 — kimi.builders",
  description: "AI 月刊:Kimi 生态与值得读的一切,编辑署名 — kimi.builders",
};

/* 运作方式(三条产品纪律;评鉴手写 = AI 参与必须披露,拍板永远是人) */
const CHARTER = [
  { zh: "组装制", en: "Assembled", note: { zh: "事实与定夺从真实数据汇编,不从零写作", en: "facts & picks assembled from real data" } },
  { zh: "署名到人", en: "Signed by humans", note: { zh: "AI 参与必须披露,拍板永远是人", en: "AI disclosed; humans decide" } },
  { zh: "评鉴手写", en: "Hand-picked", note: { zh: "选读与点评由编辑写,不外包给算法", en: "picks & notes by editors, not algorithms" } },
] as const;

/* 三层(20260921):层色贯穿全站月刊视觉 */
const LAYERS = [
  { no: "01", anchor: "digest", bar: "bg-blue", zh: "本月评鉴", en: "The review", note: { zh: "编辑署名的一手选读", en: "editor-signed picks" } },
  { no: "02", anchor: "facts", bar: "bg-status-ok", zh: "事实盘点", en: "Facts", note: { zh: "可验证的原始记录", en: "verifiable primary records" } },
  { no: "03", anchor: "decisions", bar: "bg-status-warn", zh: "编辑定夺", en: "Decisions", note: { zh: "谁拍的板,为什么", en: "who decided, and why" } },
] as const;

/* 「每期三层」卡:hero 右侧的月刊结构地图(FIELD GUIDE STACK 站内化),
   行锚到最新期的对应分节 */
function LayerStack({ slug, zh }: { slug: string; zh: boolean }) {
  return (
    <nav
      aria-label={zh ? "月刊三层结构" : "The three layers"}
      className="overflow-hidden rounded-2xl border border-line bg-card"
    >
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-status-danger/70" />
        <span aria-hidden="true" className="size-2 rounded-full bg-status-warn/70" />
        <span aria-hidden="true" className="size-2 rounded-full bg-status-ok/70" />
        <span className="ml-2 font-mono text-xs uppercase tracking-[0.08em] text-grey">
          {zh ? "每期三层" : "THE LAYERS"}
        </span>
      </div>
      <ol>
        {LAYERS.map((l) => (
          <li key={l.no} className="relative border-b border-line last:border-b-0">
            <Link
              href={`/blog/${slug}#${l.anchor}`}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-moon/60"
            >
              <span className="font-mono text-xs text-grey/70">{l.no}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-paper transition-colors group-hover:text-ui-blue">
                  {zh ? l.zh : l.en}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs text-grey">
                  {zh ? l.note.zh : l.note.en}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`absolute inset-y-2 right-0 w-0.5 rounded-full ${l.bar}`}
              />
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* 首期筹备中:一封未发时的诚实空态(不渲染空壳;blog.empty 文案) */
function EmptyState({ zh }: { zh: boolean }) {
  return (
    <section className="mt-10 border-y border-line py-12 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-grey/70">
        {zh ? "首期 · 筹备中" : "ISSUE 01 · IN THE WORKS"}
      </p>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-grey">
        {t(zh ? "zh" : "en", "blog.empty")}
      </p>
      <Link
        href="/community"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        {zh ? "去社区看看" : "Browse the community"}
      </Link>
    </section>
  );
}

export default async function BlogPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);

  if (UPCOMING.blog) {
    return <SoonPanel title={t(locale, "nav.blog")} locale={locale} expect={t(locale, "soon.blogExpect")} />;
  }
  const zh = locale === "zh";
  const { latest, metas } = await getBlogOverview(locale);
  /* 编辑入口:admin/mod 可见,action 层再校验一次(发刊走 DB 文章流) */
  const canEdit = !!user && canModerate(user.role);
  const [latestMeta, ...archive] = metas;

  return (
    <div>
      {/* hero:eyebrow + 大标题 + 导语 + facts + CTA;右侧「每期三层」卡 */}
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div>
          <div className="flex items-baseline gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-grey">
              — MONTHLY · {t(locale, "nav.blog")}
            </p>
            {canEdit && (
              <Link
                href="/blog/admin/new"
 className="ml-auto shrink-0 rounded-lg bg-blue px-3 py-1.5 font-mono text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                {t(locale, "blog.new")}
              </Link>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            {t(locale, "blog.title")}
            <span className="text-ui-blue">.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-grey">
            {zh
              ? "每月一份的 AI 评鉴报告:Kimi 生态与更广阔的 AI 世界里,值得读的新闻、资源、知识与作品——编辑署名选读,配可复算的事实盘点与编辑部定夺。AI 写得出的内容我们不发,我们发判断。"
              : "A monthly review of what's worth reading in AI — Kimi ecosystem news, resources, knowledge and builds, hand-picked and signed by editors, backed by reproducible facts and decisions. We don't publish what AI could write; we publish judgment."}
          </p>
          <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-grey">
            <span>{metas.length} {zh ? "期" : "issues"}</span>
            <span aria-hidden="true">·</span>
            <span>{zh ? "组装制" : "assembled"}</span>
            <span aria-hidden="true">·</span>
            <span>{zh ? "中英双发" : "bilingual"}</span>
          </p>
          {latest && (
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={`/blog/${latest.slug}`}
 className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
              >
                {zh ? "阅读最新一期" : "Read the latest issue"}
              </Link>
              {archive.length > 0 && (
                <a
                  href="#archive"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 text-xs text-grey transition-colors hover:border-ui-blue hover:text-ui-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
                >
                  {zh ? "往期档案 ↓" : "Archive ↓"}
                </a>
              )}
            </div>
          )}
        </div>
        {latest && <LayerStack slug={latest.slug} zh={zh} />}
      </header>

      {/* 无已发期:诚实空态;有期:最新期三层预览(meta 随行:语言回落标) */}
      {!latest ? (
        <EmptyState zh={zh} />
      ) : (
        <LatestIssue issue={latest} meta={latestMeta} locale={locale} zh={zh} />
      )}

      {/* 运作方式 */}
      <section className="grid gap-x-8 gap-y-3 border-b border-line py-5 sm:grid-cols-3">
        {CHARTER.map((c) => (
          <div key={c.zh}>
            <p className="font-mono text-xs text-paper">{zh ? c.zh : c.en}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-grey">{zh ? c.note.zh : c.note.en}</p>
          </div>
        ))}
      </section>

      {/* 往期:session-row 行式档案 */}
      {archive.length > 0 && (
        <section id="archive" className="scroll-mt-20">
          <p className="py-5 font-mono text-xs uppercase tracking-[0.08em] text-grey/70">
            {zh ? "往期 · ARCHIVE" : "ARCHIVE"}
          </p>
          {archive.map((a) => (
            <article key={a.slug} className="border-b border-line last:border-b-0">
              <Link href={`/blog/${a.slug}`} className="group flex gap-5 py-6">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-grey">
                    <span>
                      — ISSUE {String(a.issue).padStart(2, "0")} · {a.month}
                    </span>
                    {a.fallback && (
                      <span className="rounded-md border border-line px-1.5 py-px text-xs normal-case text-paper">
                        {t(locale, a.locale === "zh" ? "art.langZh" : "art.langEn")}
                      </span>
                    )}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-paper transition-colors group-hover:text-ui-blue">
                    {a.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
                    {a.summary}
                  </p>
                  <p className="mt-2 font-mono text-xs text-grey">— @{a.editorHandle}</p>
                </div>
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className="mt-2 shrink-0 self-start text-grey/50 transition-colors group-hover:text-ui-blue"
                />
              </Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

/* 最新期:大块编辑部排版,三层内嵌预览(数据 = assembleIssue 真实组装);
   meta 带语言回落标(与往期行/详情页同口径) */
function LatestIssue({
  issue,
  meta,
  locale,
  zh,
}: {
  issue: AssembledIssue;
  meta: LetterIssueMeta | undefined;
  locale: "zh" | "en";
  zh: boolean;
}) {
  return (
    <article className="mt-10 border-y border-line py-9">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-grey">
          — {zh ? "最新一期" : "LATEST"} · ISSUE {String(issue.issue).padStart(2, "0")} · {issue.month} ·{" "}
          {zh ? "主编" : "ed."} @{issue.editorHandle}
        </p>
        {meta?.fallback && (
          <span className="rounded-md border border-line px-1.5 py-px font-mono text-xs text-paper">
            {t(locale, meta.locale === "zh" ? "art.langZh" : "art.langEn")}
          </span>
        )}
      </div>
      <Link href={`/blog/${issue.slug}`} className="group mt-3 block">
        <h2 className="max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-paper transition-colors group-hover:text-ui-blue">
          {issue.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-grey">
          {issue.summary}
        </p>
      </Link>

      {/* 02 事实盘点:大号 mono 数字;缺项诚实显示「—」 */}
      <section className="mt-7">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-status-ok-fg">
          02 · {zh ? "事实盘点" : "FACTS"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {issue.facts.map((f) => (
            <div key={f.label} className="border-l-2 border-blue/60 pl-3">
              {/* break-all:TOP 模型等长值(原始 model id)可折行,不撑破格子 */}
              <p className="break-all font-mono text-2xl font-semibold leading-tight tracking-tight text-paper">
                {f.value}
              </p>
              <p className="mt-2 text-xs leading-snug text-grey">{f.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 03 编辑定夺 */}
      {issue.decisions.length > 0 && (
        <section className="mt-8">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-status-warn-fg">
            03 · {zh ? "编辑定夺" : "DECISIONS"}
          </p>
          <ul className="mt-3">
            {issue.decisions.map((d, i) => (
              <li key={`${i}-${d.kind}-${d.title}`} className="border-b border-line py-4 last:border-b-0">
                <div className="flex flex-wrap items-center gap-3">
                  {decisionChip(d.kind, zh)}
                  <span className="text-sm font-semibold text-paper">{d.title}</span>
                  {d.authorHandle && (
                    <span className="ml-auto font-mono text-xs text-grey">@{d.authorHandle}</span>
                  )}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">{d.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href={`/blog/${issue.slug}`}
        className="group mt-7 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-ui-blue transition-opacity hover:opacity-80"
      >
        {zh ? "阅读整期" : "Read the full issue"}
        <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </article>
  );
}
