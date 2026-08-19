/* 月刊详情 v4(20260921 产品转向):整期三层布局 ——
   hero(eyebrow + 大标题 + 导语 + 署名 + 层锚导航,层锚即 permalink 纪律的
   可视化)/ 01 本月评鉴(articles.body_md,编辑手写的策展长文,Markdown;
   可空则不渲染该节)/ 02 事实盘点(可验证原始记录,mono 数据,缺项「—」)/
   03 编辑定夺(精选构建/讨论 + 治理公示,理由 + 定夺编辑署名)/
   页脚(引用纪律 + 数据截止时间 + AI 参与披露)/ 期次前后导航。
   层色:01 评鉴 蓝 / 02 事实 翡翠 / 03 定夺 琥珀(与总览「每期三层」卡一致)。
   20260921:初期月刊定位为 AI 月刊(策展评鉴报告),「给官方的信」层下线
   (官方渠道无回音,再议);评鉴层即原 bodyMd 通道。
   数据为真实组装(src/lib/monthly.ts):articles(kind=letter)承载期次,
   事实/定夺来自社区统计/usage 聚合/当月 featured + payload 编辑定夺。
   板块开关未就绪时整页换「正在路上」。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { getArticleBySlug, normalizeArticleSlug } from "@/src/lib/articles";
import { canModerate } from "@/src/lib/featured";
import { monthLabel } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import {
  getAssembledIssue,
  type AssembledIssue,
  type LetterIssueMeta,
} from "@/src/lib/monthly";
import { UPCOMING } from "@/src/lib/upcoming";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import SoonPanel from "../../_components/SoonPanel";
import { decisionChip } from "../_components/chips";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  /* 关闸期间(UPCOMING.blog)不出文章标题,也不查库 */
  if (UPCOMING.blog) return { title: "月刊 — kimi.builders" };
  const { slug } = await params;
  const s = normalizeArticleSlug(slug);
  if (!s) return { title: "kimi.builders" };
  /* 按读者语言取标题(EN 读者不拿中文标题) */
  const locale = await getLocale(await getSessionUser());
  const article = await getArticleBySlug("letter", s, locale);
  if (!article) return { title: "kimi.builders" };
  return { title: `${article.title} — kimi.builders` };
}

/* 三层锚导航(permalink 纪律:位置要可引用才有价) */
const LAYER_NAV = [
  { no: "01", anchor: "digest", zh: "本月评鉴", en: "The review" },
  { no: "02", anchor: "facts", zh: "事实盘点", en: "Facts" },
  { no: "03", anchor: "decisions", zh: "编辑定夺", en: "Decisions" },
] as const;

/* 数据截止时间(页脚公示):UTC 到分钟,与站内 UTC 口径一致 */
function cutoffLabel(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/* 分节分享小按钮:复制该节 permalink + 下载该节海报 PNG
   (仅数据节有海报;01 评鉴是长文,只复制 permalink)。 */
function SectionShare({
  issue,
  anchor,
  label,
  locale,
  poster = true,
}: {
  issue: AssembledIssue;
  anchor: "digest" | "facts" | "decisions";
  label: string;
  locale: "zh" | "en";
  poster?: boolean;
}) {
  return (
    <ShareButton
      path={`/blog/${issue.slug}#${anchor}`}
      title={`${issue.title} · ${label}`}
      locale={locale}
      {...(poster
        ? {
            posterHref: `/api/share/letter/${issue.slug}?section=${anchor}`,
            posterSurface: "letter" as const,
          }
        : {})}
    />
  );
}

function IssueDetail({
  issue,
  prev,
  next,
  locale,
}: {
  issue: AssembledIssue;
  prev: LetterIssueMeta | undefined;
  next: LetterIssueMeta | undefined;
  locale: "zh" | "en";
}) {
  const zh = locale === "zh";
  const disclosure = issue.aiDisclosure;
  const disclosureRows = disclosure
    ? (Object.entries(disclosure) as [keyof NonNullable<typeof disclosure>, string][])
    : [];
  /* 披露分节键与锚一致(digest/facts/decisions),直接查 LAYER_NAV */
  const sectionLabel = (key: string) => LAYER_NAV.find((l) => l.anchor === key);
  return (
    <article>
      {/* hero:eyebrow + 大标题 + 导语 + 署名 + 层锚导航 */}
      <header className="border-b border-line pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-grey">
          — ISSUE {String(issue.issue).padStart(2, "0")} · {issue.month}
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight">
          {issue.title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-grey">
          {issue.summary}
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-grey">
          <span>
            {zh ? "主编" : "ed."}{" "}
            <Link href={`/u/${issue.editorHandle}`} className="normal-case text-paper transition-colors hover:text-ui-blue">
              @{issue.editorHandle}
            </Link>
          </span>
          <span aria-hidden="true">·</span>
          <span>{zh ? "评鉴手写" : "hand-picked"}</span>
          <span aria-hidden="true">·</span>
          <span>{zh ? "中英双发" : "bilingual"}</span>
        </p>
        {/* 层锚导航:三层结构的可视化目录 */}
        <nav
          aria-label={zh ? "本期目录" : "In this issue"}
          className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4"
        >
          {LAYER_NAV.map((l) => (
            <a
              key={l.no}
              href={`#${l.anchor}`}
              className="font-mono text-xs uppercase tracking-[0.08em] text-ui-blue transition-opacity hover:opacity-75"
            >
              {l.no} {zh ? l.zh : l.en}
            </a>
          ))}
        </nav>
      </header>

      {/* 01 本月评鉴:编辑手写的策展长文(可空则不渲染) */}
      {issue.bodyMd && (
        <section id="digest" className="scroll-mt-20 border-b border-line py-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-ui-blue">
              01 · {zh ? "本月评鉴" : "THE REVIEW"}
            </p>
            <SectionShare issue={issue} anchor="digest" label={zh ? "本月评鉴" : "The review"} locale={locale} poster={false} />
          </div>
          <div className="mt-5">
            <Markdown source={issue.bodyMd} />
          </div>
        </section>
      )}

      {/* 02 事实盘点:可验证的原始记录 */}
      <section id="facts" className="scroll-mt-20 border-b border-line py-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-status-ok-fg">
            02 · {zh ? "事实盘点" : "FACTS"}
          </p>
          <SectionShare issue={issue} anchor="facts" label={zh ? "事实盘点" : "Facts"} locale={locale} />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-grey">
          {zh
            ? "来自站内用量聚合的月度快照,口径可复算(usage CLI 开源)。原始记录不追热点,只求可被引用;缺项显示「—」,不编数。"
            : "A monthly snapshot from on-site usage aggregation, reproducible via the open-source usage CLI. Primary records chase no trend — only citability. Gaps show “—”, never invented."}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {issue.facts.map((f) => (
            <div key={f.label} className="border-l-2 border-blue/60 pl-3">
              {/* break-all:TOP 模型等长值(原始 model id)可折行,不撑破格子 */}
              <p className="break-all font-mono text-2xl font-semibold leading-tight tracking-tight text-paper">{f.value}</p>
              <p className="mt-2 text-xs leading-snug text-grey">{f.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 03 编辑定夺:谁拍的板,为什么 */}
      <section id="decisions" className="scroll-mt-20 py-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-status-warn-fg">
            03 · {zh ? "编辑定夺" : "DECISIONS"}
          </p>
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
                  <span className="text-sm font-semibold text-paper">
                    {d.href ? (
                      /* 外部作品 URL 新开标签页;站内链接(/community/<id> 等)走 Link */
                      /^https?:\/\//.test(d.href) ? (
                        <a
                          href={d.href}
                          target="_blank"
                          rel="noreferrer"
                          className="transition-colors hover:text-ui-blue"
                        >
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
                    <span className="ml-auto font-mono text-xs text-grey">
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
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-grey/80">
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
      </section>

      {/* 页脚:引用纪律 + 数据截止 + AI 参与披露 */}
      <footer className="border-t border-line pt-6 text-xs leading-relaxed text-grey/80">
        <p>
          {zh
            ? "本刊各节均可独立引用(#digest / #facts / #decisions)。中英双发,英文版是国际 builder 圈看中文 Kimi 生态的窗口。"
            : "Every section is independently citable (#digest / #facts / #decisions). Published in both languages — the English edition is the world's window into the Chinese Kimi ecosystem."}
        </p>
        <p className="mt-2 font-mono">
          {zh
            ? `事实与定夺为真实数据组装,数据截止 ${cutoffLabel(issue.assembledAt)}`
            : `Facts & decisions assembled from real data as of ${cutoffLabel(issue.assembledAt)}`}
        </p>
        {disclosureRows.length > 0 && (
          <p className="mt-2">
            {zh ? "AI 参与披露:" : "AI involvement disclosed: "}
            {disclosureRows.map(([key, note], i) => (
              <span key={key}>
                {i > 0 && (zh ? ";" : "; ")}
                {sectionLabel(key)
                  ? `${sectionLabel(key)!.no} ${zh ? sectionLabel(key)!.zh : sectionLabel(key)!.en}`
                  : key}
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
          <Link href={`/blog/${prev.slug}`} className="group min-w-0">
            <span className="flex items-center gap-1.5 font-mono text-xs text-grey transition-colors group-hover:text-ui-blue">
              <ArrowLeft size={13} aria-hidden="true" />
              {zh ? "上一期" : "OLDER"}
            </span>
            <span className="mt-1.5 block truncate font-mono text-xs text-paper/80 transition-colors group-hover:text-ui-blue">
              ISSUE {String(prev.issue).padStart(2, "0")} · {prev.month}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/blog/${next.slug}`} className="group min-w-0 text-right">
            <span className="flex items-center justify-end gap-1.5 font-mono text-xs text-grey transition-colors group-hover:text-ui-blue">
              {zh ? "下一期" : "NEWER"}
              <ArrowRight size={13} aria-hidden="true" />
            </span>
            <span className="mt-1.5 block truncate font-mono text-xs text-paper/80 transition-colors group-hover:text-ui-blue">
              ISSUE {String(next.issue).padStart(2, "0")} · {next.month}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <p className="mt-6 pb-2">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-grey transition-colors hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, "nav.blog")}
        </Link>
      </p>
    </article>
  );
}

export default async function LetterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = normalizeArticleSlug(slug);
  if (!s) notFound();
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* 板块未就绪(src/lib/upcoming.ts):详情页同样换「正在路上」,不查库 */
  if (UPCOMING.blog) {
    return <SoonPanel title={t(locale, "nav.blog")} locale={locale} />;
  }
  const result = await getAssembledIssue(s, locale);
  if (!result) notFound();
  const { issue, metas } = result;
  const idx = metas.findIndex((m) => m.slug === issue.slug);
  /* metas 新→旧排序:prev=更早一期(idx+1),next=更新(idx-1) */
  const prev = metas[idx + 1];
  const next = idx > 0 ? metas[idx - 1] : undefined;

  return (
    <div>
      {/* 文章元信息条:返回 / 月份 / 语言回落标 / 编辑入口 */}
      <div className="mb-6 flex items-center gap-3 font-mono text-xs tracking-wider text-grey">
        <span>{monthLabel(issue.publishedAt)}</span>
        {metas[idx]?.fallback && (
          <span className="rounded-md border border-line px-1.5 py-px text-xs text-paper">
            {t(locale, metas[idx].locale === "zh" ? "art.langZh" : "art.langEn")}
          </span>
        )}
        {!!user && canModerate(user.role) && (
          <Link
            href={`/blog/admin/${issue.slug}/edit?locale=${metas[idx]?.locale ?? locale}`}
            className="ml-auto rounded-lg px-2 py-1 text-grey transition-colors hover:bg-moon hover:text-ui-blue"
          >
            {t(locale, "post.edit")}
          </Link>
        )}
      </div>
      <IssueDetail issue={issue} prev={prev} next={next} locale={locale} />
    </div>
  );
}
