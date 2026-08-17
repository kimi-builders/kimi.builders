/* 知识库 · 路径详情 v3(20260816 三轮重设计;20260920 机械结构改造;20260921 评审修订)
   按路径的 variant 分发两种模板(不做通用一页,用户拍板):
   共同底座:验证戳(RFC §2.2,stale 由 isPathStale 计算,不再手填)、
   验证记录时间线(当前戳 + reverifyLog)、编辑理由可见、
   证据对象化(ref 解析成真实对象,解析不到即降级隐藏)、
   讨论闭环(discussionPostId 社区帖最新 3 条 + 去讨论,未配置不渲染)、
   毕业物闭环(source_path 真实毕业作品 + 「成为第一个毕业生」CTA)。
   20260921 评审修订:计数与渲染同口径——统计只数可见资源(external +
   ref 解析成功),整层无可见内容(资源全隐藏且无支线)则整层不渲染,
   层号按可见层重排;MockRibbon 改分区措辞(策展预览,讨论/毕业作品为真实记录)。
   板块开关未就绪时整页换「正在路上」。 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, Clock3, GraduationCap, History, MessagesSquare, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber, plainExcerpt } from "@/src/lib/format";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import {
  findLearnPath,
  isPathStale,
  resourceKindMeta,
  type LearnPath,
  type PathLevel,
  type PathResource,
} from "../_data";
import {
  getPathDiscussion,
  getPathGraduateCards,
  resolvePathRefs,
  type GraduateCard,
  type PathDiscussion,
  type ResolvedRef,
} from "../_resolve";
import MockRibbon from "../../_components/MockRibbon";
import SoonPanel from "../../_components/SoonPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  /* 关闸期间(UPCOMING.learn)不出标题 */
  if (UPCOMING.learn) return { title: "知识库 — kimi.builders" };
  const { slug } = await params;
  const path = findLearnPath(slug);
  return { title: path ? `${path.title.zh} — kimi.builders` : "kimi.builders" };
}

/* ---------- 共用小件 ---------- */

/* 可见层(20260921 计数同口径):li = 原始层下标(ref 解析键 "层序:资源序" 用),
   visible = 可见资源数(external + ref 解析成功);整层无可见资源且无支线 → 不入列 */
interface VisibleLevel {
  level: PathLevel;
  li: number;
  visible: number;
}

function visibleResourceCount(
  level: PathLevel,
  li: number,
  refs: Map<string, ResolvedRef | null>,
): number {
  return level.resources.filter(
    (r, j) => r.external || (refs.get(`${li}:${j}`) ?? null) !== null,
  ).length;
}

function verifyStamp(path: LearnPath, zh: boolean) {
  return (
    <span className="flex items-center gap-1.5">
      <ShieldCheck
        size={13}
        className={isPathStale(path) ? "text-amber-400" : "text-emerald-400"}
        aria-hidden="true"
      />
      @{path.editorHandle} {zh ? "验证" : "verified"} · {path.verifiedModel} · {path.verifiedAt}
    </span>
  );
}

/* 层头:LEVEL 章 + 难度点 + 统计(两种模板共用,保持同一节奏);
   统计只报可见资源数(20260921),0 时让位给时长 */
function LevelHeader({
  index,
  total,
  level,
  count,
  zh,
}: {
  index: number;
  total: number;
  level: PathLevel;
  count: number;
  zh: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="whitespace-nowrap rounded-md border border-blue/60 px-1.5 py-px font-mono text-[11px] text-blue">
        LEVEL {String(index + 1).padStart(2, "0")}
      </span>
      <span className="font-mono text-xs text-grey/70" aria-hidden="true">
        {"●".repeat(index + 1)}
        {"○".repeat(Math.max(total - index - 1, 0))}
      </span>
      <span className="font-mono text-[11px] text-grey">
        {count > 0 && <>{count} {zh ? "个资源" : "resources"} · </>}
        {zh ? `约 ${level.hours} 小时` : `~${level.hours}h`}
      </span>
    </div>
  );
}

/* ---------- journey:脊柱式 ---------- */

/* 资源节点:圆形字位徽章(类型短码,kind 配色)+ 标题 + 出处 + 编辑理由。
   ref 卡(站内引用):标题/链接/署名来自解析后的真实对象(作品带声明徽章);
   解析不到(占位 id/已删/不可见)→ 整卡降级隐藏,不指向空页。 */
function SpineNode({
  r,
  zh,
  resolved,
}: {
  r: PathResource;
  zh: boolean;
  resolved?: ResolvedRef | null;
}) {
  const meta = resourceKindMeta(r.kind, zh);
  const card = r.external
    ? {
        href: r.href,
        title: zh ? r.title.zh : r.title.en,
        author: zh ? r.author.zh : r.author.en,
        external: true,
        badge: null as number | null,
      }
    : resolved
      ? {
          href: resolved.href,
          title: resolved.title,
          author: resolved.author,
          external: false,
          badge: resolved.claimBadge,
        }
      : null;
  if (!card) return null;
  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full border bg-bg font-mono text-[10px] font-semibold transition-colors group-hover:border-blue group-hover:text-blue ${meta.chip}`}
      >
        {r.code}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="text-sm font-semibold leading-snug text-paper transition-colors group-hover:text-blue">
          {card.title}
          {card.external && (
            <ArrowUpRight size={13} className="ml-1 inline shrink-0 align-[-2px] text-grey" aria-hidden="true" />
          )}
        </span>
        <span className="mt-1 block font-mono text-[11px] text-grey">
          {card.author} · {zh ? r.duration.zh : r.duration.en}
          {card.badge !== null && card.badge > 0 && (
            <span className="ml-2 text-blue">
              {zh ? "声明投入" : "claimed"} {compactNumber(card.badge, zh ? "zh" : "en")}
            </span>
          )}
        </span>
        <span className="mt-1.5 block text-xs leading-relaxed text-grey">
          <span className="font-mono text-[10px] tracking-wider text-grey/60">WHY · </span>
          {zh ? r.why.zh : r.why.en}
        </span>
      </span>
    </>
  );
  return card.external ? (
    <a href={card.href} target="_blank" rel="noopener noreferrer" className="group relative flex gap-4">
      {inner}
    </a>
  ) : (
    <Link href={card.href} className="group relative flex gap-4">
      {inner}
    </Link>
  );
}

/* 脊柱:竖向发丝线串起本层资源;
   调用方保证本层有可见资源(否则竖线落空) */
function Spine({
  level,
  li,
  zh,
  resolvedRefs,
}: {
  level: PathLevel;
  /* 层下标:ref 解析结果的 key 是 "层序:资源序" */
  li: number;
  zh: boolean;
  resolvedRefs: Map<string, ResolvedRef | null>;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute bottom-5 left-[18px] top-2 w-px bg-line"
      />
      <div className="space-y-5">
        {level.resources.map((r, j) => (
          <SpineNode
            key={j}
            r={r}
            zh={zh}
            resolved={r.external ? undefined : (resolvedRefs.get(`${li}:${j}`) ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

/* 可选支线:脊柱末端的虚线岔口 */
function Branches({ level, zh }: { level: PathLevel; zh: boolean }) {
  if (!level.branches.length) return null;
  return (
    <div className="ml-[18px] mt-6 border-l border-dashed border-line pl-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-grey/70">
        {zh ? "支线 · OPTIONAL BRANCHES" : "OPTIONAL BRANCHES"}
      </p>
      <ul className="mt-2.5 space-y-2.5">
        {level.branches.map((b) => (
          <li key={b.title.zh} className="text-xs">
            {b.external ? (
              <a
                href={b.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-paper transition-colors hover:text-blue"
              >
                {zh ? b.title.zh : b.title.en}
              </a>
            ) : (
              <Link href={b.href} className="font-medium text-paper transition-colors hover:text-blue">
                {zh ? b.title.zh : b.title.en}
              </Link>
            )}
            <span className="ml-2 font-mono text-[10.5px] text-grey">
              — {zh ? b.meta.zh : b.meta.en}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 验证记录:当前验证戳 + reverifyLog 重验痕迹
   (担保要有担保的机械结构——戳会过期,痕迹不删) */
function VerifyLog({ path, zh }: { path: LearnPath; zh: boolean }) {
  const stale = isPathStale(path);
  return (
    <section className="border-b border-line py-9">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-grey/70">
        {zh ? "验证记录 · VERIFY LOG" : "VERIFY LOG"}
      </p>
      <ol className="mt-4 space-y-2.5">
        <li className="flex items-start gap-2.5 text-xs leading-relaxed text-grey">
          <ShieldCheck
            size={13}
            className={`mt-0.5 shrink-0 ${stale ? "text-amber-400" : "text-emerald-400"}`}
            aria-hidden="true"
          />
          <span>
            <span className="font-mono text-[11.5px] text-paper">
              {path.verifiedAt} · {path.verifiedModel}
            </span>
            {" — "}
            {zh ? `当前验证戳(@${path.editorHandle})` : `current stamp (@${path.editorHandle})`}
            {stale && (
              <span className="ml-2 whitespace-nowrap rounded-md border border-amber-500/40 px-1.5 py-px font-mono text-[10.5px] text-amber-400">
                {zh ? "待重验" : "re-verify pending"}
              </span>
            )}
          </span>
        </li>
        {path.reverifyLog.map((e) => (
          <li
            key={`${e.at}-${e.model}`}
            className="flex items-start gap-2.5 text-xs leading-relaxed text-grey"
          >
            <History size={13} className="mt-0.5 shrink-0 text-grey/50" aria-hidden="true" />
            <span>
              <span className="font-mono text-[11.5px] text-paper">
                {e.at} · {e.model}
              </span>
              {" — "}
              {zh ? e.note.zh : e.note.en}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* 讨论闭环(RFC §2.5,零新评论系统):路径挂载的社区帖 + 最新 3 条评论 +
   「去讨论」入口;未配置 discussionPostId 时整块不渲染 */
function DiscussionBlock({
  discussion,
  zh,
}: {
  discussion: PathDiscussion;
  zh: boolean;
}) {
  return (
    <section className="border-b border-line py-9">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-grey/70">
        <MessagesSquare size={13} aria-hidden="true" />
        {zh ? "讨论 · DISCUSSION" : "DISCUSSION"}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/community/${discussion.postId}`}
          className="text-sm font-semibold text-paper transition-colors hover:text-blue"
        >
          {discussion.title}
        </Link>
        <span className="font-mono text-[11px] text-grey">
          {discussion.commentCount} {zh ? "条讨论" : "comments"}
        </span>
        <Link
          href={`/community/${discussion.postId}`}
          aria-label={zh ? `去「${discussion.title}」参与讨论` : `Join the discussion on "${discussion.title}"`}
          className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-blue hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          {zh ? "去讨论 →" : "Join the discussion →"}
        </Link>
      </div>
      {discussion.comments.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {discussion.comments.map((c) => (
            <li key={c.id} className="text-xs leading-relaxed text-grey">
              <span className="font-mono text-[11px] text-paper/80">
                {c.isAi ? "Kimi AI" : `@${c.handle ?? "?"}`}
              </span>
              {" · "}
              {plainExcerpt(c.bodyMd, 120)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-grey">
          {zh
            ? "还没有讨论——关于这条路径的问题,去帖子里问第一声。"
            : "No discussion yet — ask the first question about this path."}
        </p>
      )}
    </section>
  );
}

/* 毕业归因(plan §二.5):该路径真实毕业作品(works.source_path = slug,
   公开未屏蔽,卡片带声明徽章)。空态克制:不做负面标记,
   给「成为第一个毕业生」CTA(/works/new?path=slug 带入来源上下文)。 */
function GraduatesBlock({
  path,
  graduates,
  zh,
}: {
  path: LearnPath;
  graduates: GraduateCard[];
  zh: boolean;
}) {
  return (
    <div className="mt-6">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-grey/70">
        <GraduationCap size={13} aria-hidden="true" />
        {zh ? "毕业作品 · GRADUATES" : "GRADUATES"}
      </p>
      {graduates.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {graduates.map(({ work, claimBadge }) => (
            <li key={work.id}>
              <Link
                href={`/works/${work.id}`}
                className="group flex items-baseline gap-2.5"
              >
                {/* 作品名可截断(name ≤120 字符,窄屏不撑破行);
                    tagline 次级,<lg 让位 */}
                <span className="min-w-0 truncate text-sm font-semibold text-paper transition-colors group-hover:text-blue">
                  {work.name}
                </span>
                {work.tagline && (
                  <span className="hidden min-w-0 truncate text-xs text-grey lg:inline">
                    {work.tagline}
                  </span>
                )}
                <span className="ml-auto shrink-0 font-mono text-[11px] text-grey">
                  {work.handle ? `@${work.handle}` : work.authorLabel}
                  {claimBadge !== null && claimBadge > 0 && (
                    <span className="ml-2 text-blue">
                      {zh ? "声明投入" : "claimed"}{" "}
                      {compactNumber(claimBadge, zh ? "zh" : "en")}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-grey">
          {zh
            ? "这条路径还没有毕业作品——虚位以待。"
            : "No graduates on this path yet — the wall is waiting."}
        </p>
      )}
      <Link
        href={`/works/new?path=${path.slug}`}
        className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-blue hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        {graduates.length > 0
          ? zh
            ? "我也走完了,发布毕业物 →"
            : "I walked it too — ship yours →"
          : zh
            ? "成为第一个毕业生 →"
            : "Be the first graduate →"}
      </Link>
    </div>
  );
}

function JourneyLayout({
  path,
  zh,
  levels,
  resolvedRefs,
  discussion,
  graduates,
}: {
  path: LearnPath;
  zh: boolean;
  levels: VisibleLevel[];
  resolvedRefs: Map<string, ResolvedRef | null>;
  discussion: PathDiscussion | null;
  graduates: GraduateCard[];
}) {
  const totalVisible = levels.reduce((n, v) => n + v.visible, 0);
  return (
    <article>
      {/* hero:eyebrow + 大标题 + 金句 + 摘要 + facts + CTA(统计只报可见) */}
      <header className="border-b border-line pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
          — {path.code} ·{" "}
          {path.tier === "starter" ? (zh ? "入门" : "STARTER") : zh ? "进阶" : "BUILDER"} ·{" "}
          {levels.length} {zh ? "层" : "levels"} · {totalVisible}{" "}
          {zh ? "个资源" : "resources"}
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight">
          {zh ? path.title.zh : path.title.en}
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-grey">
          {zh ? `「${path.tagline.zh}」` : `“${path.tagline.en}”`}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-grey">
          {zh ? path.summary.zh : path.summary.en}
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
          <span className="flex items-center gap-1.5">
            <Clock3 size={13} aria-hidden="true" />
            {zh ? `约 ${path.hours} 小时` : `~${path.hours}h`}
          </span>
          <span aria-hidden="true">·</span>
          {verifyStamp(path, zh)}
          {isPathStale(path) && (
            <span className="rounded-md border border-amber-500/40 px-1.5 py-px normal-case tracking-normal text-amber-400">
              {zh ? "待重验:地面已动,编辑尚未重走" : "re-verify pending: ground shifted"}
            </span>
          )}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a
            href="#level-01"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {zh ? "开始路径 ↓" : "Begin path ↓"}
          </a>
          <Link
            href="/works"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 font-mono text-xs text-grey transition-colors hover:border-blue hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {zh ? "毕业物是什么 →" : "What's the graduation →"}
          </Link>
        </div>
      </header>

      {/* 层(可见层重排层号):层头 → 左层卡(md+ 吸顶)+ 右脊柱 + 支线岔口;
          本层可见资源为 0 时脊柱不渲染(竖线不落空),支线仍在 */}
      {levels.map((v, i) => (
        <section
          key={v.level.name.zh}
          id={`level-${String(i + 1).padStart(2, "0")}`}
          className="scroll-mt-20 border-b border-line py-9 last:border-b-0"
        >
          <LevelHeader index={i} total={levels.length} level={v.level} count={v.visible} zh={zh} />
          <div className="mt-5 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
            <div className="md:sticky md:top-20 md:self-start">
              <h2 className="text-xl font-semibold tracking-tight">
                {zh ? v.level.name.zh : v.level.name.en}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-grey">
                {zh ? v.level.desc.zh : v.level.desc.en}
              </p>
              {v.level.learn.length > 0 && (
                <div className="mt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-grey/70">
                    {zh ? "你将学会 · YOU'LL LEARN" : "YOU'LL LEARN"}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {v.level.learn.map((item) => (
                      <li key={item.zh} className="flex items-start gap-2 text-xs leading-relaxed text-paper/80">
                        <Check size={13} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
                        {zh ? item.zh : item.en}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-6 min-w-0 md:mt-0">
              {v.visible > 0 && (
                <Spine level={v.level} li={v.li} zh={zh} resolvedRefs={resolvedRefs} />
              )}
              <Branches level={v.level} zh={zh} />
            </div>
          </div>
        </section>
      ))}

      {/* 验证记录 + 讨论闭环(未配置 discussionPostId 不渲染) */}
      <VerifyLog path={path} zh={zh} />
      {discussion && <DiscussionBlock discussion={discussion} zh={zh} />}

      {/* 成就徽章+ 真实毕业作品 */}
      <section className="py-9">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-dashed border-grey/40 font-mono text-[10px] leading-tight text-grey/60"
          >
            {zh ? "未解锁" : "LOCKED"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue">
              {zh ? "成就 · ACHIEVEMENT" : "ACHIEVEMENT"}
            </p>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
              {zh ? path.achievement.title.zh : path.achievement.title.en}
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-grey">
              {zh ? path.achievement.note.zh : path.achievement.note.en}
            </p>
          </div>
          <Link
            href={`/works/new?path=${path.slug}`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {zh ? "去发布毕业物 →" : "Ship your graduation →"}
          </Link>
        </div>
        <GraduatesBlock path={path} graduates={graduates} zh={zh} />
      </section>

      <p className="pb-2">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(zh ? "zh" : "en", "nav.learn")}
        </Link>
      </p>
    </article>
  );
}

/* ---------- editorial:Zhaphar sessions 行式 ---------- */

function EditorialRow({
  r,
  zh,
  resolved,
}: {
  r: PathResource;
  zh: boolean;
  resolved?: ResolvedRef | null;
}) {
  const meta = resourceKindMeta(r.kind, zh);
  /* 与 SpineNode 同口径:ref 卡展示真实对象,解析不到 → 整行降级隐藏 */
  const card = r.external
    ? {
        href: r.href,
        title: zh ? r.title.zh : r.title.en,
        author: zh ? r.author.zh : r.author.en,
        external: true,
        badge: null as number | null,
      }
    : resolved
      ? {
          href: resolved.href,
          title: resolved.title,
          author: resolved.author,
          external: false,
          badge: resolved.claimBadge,
        }
      : null;
  if (!card) return null;
  const inner = (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
        — {meta.label} · {zh ? r.duration.zh : r.duration.en}
      </p>
      <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-paper transition-colors group-hover:text-blue">
        {card.title}
        {card.external && (
          <ArrowUpRight size={14} className="ml-1 inline shrink-0 align-[-2px] text-grey" aria-hidden="true" />
        )}
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
        <span className="font-mono text-[10px] tracking-wider text-grey/60">WHY · </span>
        {zh ? r.why.zh : r.why.en}
      </p>
      <p className="mt-2 font-mono text-[11px] text-grey">
        {card.author}
        {card.badge !== null && card.badge > 0 && (
          <span className="ml-2 text-blue">
            {zh ? "声明投入" : "claimed"} {compactNumber(card.badge, zh ? "zh" : "en")}
          </span>
        )}
      </p>
    </>
  );
  return (
    <article className="border-b border-line py-5 last:border-b-0">
      {card.external ? (
        <a href={card.href} target="_blank" rel="noopener noreferrer" className="group block">
          {inner}
        </a>
      ) : (
        <Link href={card.href} className="group block">
          {inner}
        </Link>
      )}
    </article>
  );
}

function EditorialLayout({
  path,
  zh,
  levels,
  resolvedRefs,
  discussion,
  graduates,
}: {
  path: LearnPath;
  zh: boolean;
  levels: VisibleLevel[];
  resolvedRefs: Map<string, ResolvedRef | null>;
  discussion: PathDiscussion | null;
  graduates: GraduateCard[];
}) {
  const platforms = Array.from(
    new Set(
      path.levels.flatMap((l) =>
        l.resources.map((r) => resourceKindMeta(r.kind, zh).label),
      ),
    ),
  );
  const first = path.levels[0]?.resources[0];
  /* 「开始第一站」:ref 资源取解析后的真实链接;解析不到 → 不渲染该入口(不指向空页) */
  const firstHref = first
    ? first.external
      ? first.href
      : (resolvedRefs.get("0:0")?.href ?? null)
    : null;
  return (
    <article>
      {/* hero:Zhaphar session-hero 语言(eyebrow + 大标题 + lead + facts + actions) */}
      <header className="border-b border-line pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
          — {path.code} ·{" "}
          {path.tier === "starter" ? (zh ? "入门" : "STARTER") : zh ? "进阶" : "BUILDER"}
          {isPathStale(path) && (
            <span className="ml-2 rounded-md border border-amber-500/40 px-1.5 py-px text-amber-400">
              {zh ? "待重验" : "RE-VERIFY PENDING"}
            </span>
          )}
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight">
          {zh ? path.title.zh : path.title.en}
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-grey">
          {zh ? `「${path.tagline.zh}」` : `“${path.tagline.en}”`}
        </p>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-grey">
          {zh ? path.summary.zh : path.summary.en}
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-grey">
          <span>{platforms.join(" · ")}</span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={13} aria-hidden="true" />
            {zh ? `约 ${path.hours} 小时` : `~${path.hours}h`}
          </span>
          <span aria-hidden="true">·</span>
          {verifyStamp(path, zh)}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
          {firstHref &&
            (first?.external ? (
              <a
                href={firstHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue transition-opacity hover:opacity-80"
              >
                {zh ? "开始第一站 →" : "Start the first stop →"}
              </a>
            ) : (
              <Link
                href={firstHref}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue transition-opacity hover:opacity-80"
              >
                {zh ? "开始第一站 →" : "Start the first stop →"}
              </Link>
            ))}
          <Link
            href="/community/new"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue transition-opacity hover:opacity-80"
          >
            {zh ? "提交学习笔记 →" : "Submit your notes →"}
          </Link>
        </div>
      </header>

      {/* 层(可见层重排层号)→ 行式条目(session-row 语言,层头与 journey 同一节奏) */}
      {levels.map((v, i) => (
        <section
          key={v.level.name.zh}
          id={`level-${String(i + 1).padStart(2, "0")}`}
          className="scroll-mt-20 border-b border-line py-9 last:border-b-0"
        >
          <LevelHeader index={i} total={levels.length} level={v.level} count={v.visible} zh={zh} />
          <h2 className="mt-3 text-xl font-semibold tracking-tight">
            {zh ? v.level.name.zh : v.level.name.en}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">
            {zh ? v.level.desc.zh : v.level.desc.en}
          </p>
          <div className="mt-4">
            {v.level.resources.map((r, j) => (
              <EditorialRow
                key={`${path.slug}-${v.li}-${j}`}
                r={r}
                zh={zh}
                resolved={r.external ? undefined : (resolvedRefs.get(`${v.li}:${j}`) ?? null)}
              />
            ))}
          </div>
          <Branches level={v.level} zh={zh} />
        </section>
      ))}

      {/* 验证记录 + 讨论闭环(未配置 discussionPostId 不渲染) */}
      <VerifyLog path={path} zh={zh} />
      {discussion && <DiscussionBlock discussion={discussion} zh={zh} />}

      {/* 成就与毕业物(真实毕业作品见 GraduatesBlock) */}
      <section className="py-9">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-grey">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue">
              {zh ? "成就 · " : "ACHIEVEMENT · "}
            </span>
            {zh ? path.achievement.title.zh : path.achievement.title.en}
            {" — "}
            {zh ? path.achievement.note.zh : path.achievement.note.en}
          </p>
          <Link
            href={`/works/new?path=${path.slug}`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-blue bg-blue px-5 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            {zh ? "去发布毕业物 →" : "Ship your graduation →"}
          </Link>
        </div>
        <GraduatesBlock path={path} graduates={graduates} zh={zh} />
      </section>

      <p className="pb-2">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-grey transition-colors hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(zh ? "zh" : "en", "nav.learn")}
        </Link>
      </p>
    </article>
  );
}

/* ---------- 页面:按 variant 分发 ---------- */

export default async function PathPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* 板块未就绪(src/lib/upcoming.ts):详情页同样换「正在路上」,不查库 */
  if (UPCOMING.learn) {
    return <SoonPanel title={t(locale, "nav.learn")} locale={locale} />;
  }
  const path = findLearnPath(slug);
  if (!path) notFound();
  const zh = locale === "zh";
  const viewer = user ? { id: user.id, role: user.role } : null;
  /* 真实数据装配(并行):ref 解析(占位/失效 → 降级隐藏)、
     讨论帖(未配置 → null 不渲染)、本路径毕业作品 */
  const [resolvedRefs, discussion, graduates] = await Promise.all([
    resolvePathRefs(path, viewer),
    path.discussionPostId
      ? getPathDiscussion(path.discussionPostId, viewer)
      : Promise.resolve(null),
    getPathGraduateCards(path.slug),
  ]);
  /* 计数与渲染同口径(20260921 评审):可见层 = 有可见资源或有支线;
     层号按可见层重排,统计只报可见资源 */
  const levels: VisibleLevel[] = path.levels
    .map((level, li) => ({
      level,
      li,
      visible: visibleResourceCount(level, li, resolvedRefs),
    }))
    .filter((v) => v.visible > 0 || v.level.branches.length > 0);
  return (
    <>
      <MockRibbon
        zh={zh}
        message={
          zh
            ? "设计预览 · 路径策展(标题/文案/外链)为模拟数据;讨论与毕业作品为站内真实记录"
            : "DESIGN PREVIEW · curation (titles, copy, links) is mock; discussions & graduates are real records"
        }
      />
      {path.variant === "editorial" ? (
        <EditorialLayout
          path={path}
          zh={zh}
          levels={levels}
          resolvedRefs={resolvedRefs}
          discussion={discussion}
          graduates={graduates}
        />
      ) : (
        <JourneyLayout
          path={path}
          zh={zh}
          levels={levels}
          resolvedRefs={resolvedRefs}
          discussion={discussion}
          graduates={graduates}
        />
      )}
    </>
  );
}
