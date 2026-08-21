/* 系列页共用的三个真实数据区块(20260820 教程化;自旧 [slug]/page.tsx 平移):
   验证记录时间线(当前戳 + 重验痕迹)、讨论闭环、毕业作品。
   配色/字距走全局令牌;空态克制(无帖不渲染讨论,无毕业作品给 CTA)。 */
import Link from "next/link";
import { GraduationCap, History, MessagesSquare, ShieldCheck } from "lucide-react";
import { compactNumber, plainExcerpt } from "@/src/lib/format";
import { isPathStale, type LearnSeries } from "@/src/lib/learn-series";
import type { GraduateCard, SeriesDiscussion } from "../_blocks";

/* 验证记录:当前验证戳 + reverifyLog 重验痕迹
   (担保要有担保的机械结构——戳会过期,痕迹不删) */
export function VerifyLog({ series, zh }: { series: LearnSeries; zh: boolean }) {
  const stale = isPathStale(series);
  return (
    <section className="border-b border-line py-9">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-grey/70">
        {zh ? "验证记录 · VERIFY LOG" : "VERIFY LOG"}
      </p>
      <ol className="mt-4 space-y-2.5">
        <li className="flex items-start gap-2.5 text-xs leading-relaxed text-grey">
          <ShieldCheck
            size={13}
            className={`mt-0.5 shrink-0 ${stale ? "text-status-warn-fg" : "text-status-ok-fg"}`}
            aria-hidden="true"
          />
          <span>
            <span className="font-mono text-[11.5px] text-paper">
              {series.verifiedAt} · {series.verifiedModel}
            </span>
            {" — "}
            {zh
              ? `当前验证戳(@${series.editorHandle})`
              : `current stamp (@${series.editorHandle})`}
            {stale && (
              <span className="ml-2 whitespace-nowrap rounded-md border border-status-warn/40 px-1.5 py-px font-mono text-[10.5px] text-status-warn-fg">
                {zh ? "待重验" : "re-verify pending"}
              </span>
            )}
          </span>
        </li>
        {series.reverifyLog.map((e) => (
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

/* 讨论闭环:系列挂载的社区帖 + 最新 3 条评论 +「去讨论」入口 */
export function DiscussionBlock({
  discussion,
  zh,
}: {
  discussion: SeriesDiscussion;
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
            ? "还没有讨论——关于这个系列的问题,去帖子里问第一声。"
            : "No discussion yet — ask the first question about this series."}
        </p>
      )}
    </section>
  );
}

/* 毕业作品:该系列真实毕业作品(works.source_path = 系列 slug,公开未屏蔽,
   卡片带声明徽章)。空态克制:不做负面标记,给「成为第一个毕业生」CTA。 */
export function GraduatesBlock({
  series,
  graduates,
  zh,
}: {
  series: LearnSeries;
  graduates: GraduateCard[];
  zh: boolean;
}) {
  return (
    <section className="py-9">
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
                {/* 作品名可截断(name ≤120 字符,窄屏不撑破行);tagline 次级,<lg 让位 */}
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
            ? "这个系列还没有毕业作品——虚位以待。"
            : "No graduates on this series yet — the wall is waiting."}
        </p>
      )}
      <Link
        href={`/works/new?path=${series.slug}`}
        className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-mono text-[11px] text-grey transition-colors hover:border-blue hover:text-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      >
        {graduates.length > 0
          ? zh
            ? "我也做完了,发布毕业物 →"
            : "I finished it too — ship yours →"
          : zh
            ? "成为第一个毕业生 →"
            : "Be the first graduate →"}
      </Link>
    </section>
  );
}
