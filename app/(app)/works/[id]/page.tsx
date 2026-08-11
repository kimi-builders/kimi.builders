/* 作品详情(P1-2):面包屑 + 标题(精选芯片)+ 大截图 + 「体验作品/支持/分享」按钮行
   + 长描述(works 无独立长描述字段,tagline 按 Markdown 渲染)+ 元数据
   (<xl 正文内联侧栏:作者卡/链接/agents/发布时间/支持数;≥xl 由右栏元数据卡取代,
   见右栏注册表 work kind)+ 底部单层评论区。
   浏览无需登录;支持/评论需登录(comment/vote 配额限流)。AI 不介入作品评论。
   不存在/已删作品给友好文案,不 404 硬错。 */
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Heart } from "lucide-react";
import Avatar from "@/components/Avatar";
import AgentIcon from "@/components/AgentIcon";
import LoadMore from "@/components/LoadMore";
import Markdown from "@/components/Markdown";
import ModelIcon from "@/components/ModelIcon";
import ShareButton from "@/components/ShareButton";
import { agentName } from "@/src/lib/agents";
import { getSessionUser } from "@/src/lib/auth/session";
import { compactNumber, relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { modelFamilyName } from "@/src/lib/model-families";
import { workKind, workKindLabel } from "@/src/lib/work-kinds";
import {
  claimBadgeOf,
  getAuthorClaimContext,
  getWork,
  getWorkDetail,
  hasWorkVote,
} from "@/src/lib/works";
import { loadMoreWorkCommentsAction } from "../actions";
import { loadWorkComments } from "../_components/work-comment-page";
import WorkCommentForm from "../_components/WorkCommentForm";
import WorkOwnerActions from "../_components/WorkOwnerActions";
import WorkScreenshot from "../_components/WorkScreenshot";
import WorkVoteButton from "../_components/WorkVoteButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const work = await getWork(Number(id) || 0);
  if (!work) return { title: "kimi.builders" };
  return { title: `${work.name} — kimi.builders` };
}

/* 不存在/已撤下:友好文案 + 回作品墙,不硬 404。 */
function WorkGone({ locale }: { locale: Locale }) {
  return (
    <div className="mt-16 text-center">
      <p className="text-sm leading-relaxed text-grey">
        {t(locale, "works.notFound")}
      </p>
      <Link
        href="/works"
        className="mt-4 inline-block border border-line px-4 py-1.5 font-mono text-xs text-grey transition-colors hover:border-blue hover:text-blue"
      >
        {t(locale, "works.backToWorks")}
      </Link>
    </div>
  );
}

export default async function WorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workId = Number(id);
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!Number.isInteger(workId) || workId <= 0) return <WorkGone locale={locale} />;
  const work = await getWorkDetail(workId);
  if (!work) return <WorkGone locale={locale} />;

  const [voted, claimCtx, comments] = await Promise.all([
    user ? hasWorkVote(user.id, workId) : false,
    /* 声明徽章(声明制):作者可验证总量 + 其全部作品 Σ声明(内部口径,不做 opt-in 门禁);
       与右栏元数据卡共用同一请求级缓存(getAuthorClaimContext,不多查库) */
    work.userId !== null
      ? getAuthorClaimContext(work.userId)
      : Promise.resolve(null),
    loadWorkComments(workId, work.userId, user, locale),
  ]);
  const claimBadge =
    work.userId !== null && claimCtx
      ? claimBadgeOf(
          work,
          new Map([[work.userId, claimCtx.total]]),
          new Map([[work.userId, claimCtx.claimSum]]),
        )
      : null;

  return (
    <div>
      {/* 面包屑:作品(awesome 条目回 /awesome)/ 名称 */}
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-wider text-grey">
        <Link
          href={work.source === "awesome" ? "/awesome" : "/works"}
          className="shrink-0 hover:text-paper"
        >
          ← {t(locale, work.source === "awesome" ? "nav.awesome" : "nav.works")}
        </Link>
        <span className="truncate">{work.name}</span>
      </div>

      <h1 className="mt-4 text-2xl font-semibold leading-snug">
        {work.name}
        {work.scope && (
          <span className="ml-2 inline-block rounded-md bg-blue/10 px-1.5 py-px align-middle font-mono text-[10px] font-medium text-blue">
            {t(
              locale,
              work.scope === "eco"
                ? "awesome.scopeEco"
                : work.scope === "part"
                  ? "awesome.scopePart"
                  : "awesome.scopeBase",
            )}
          </span>
        )}
        {work.status !== "released" && (
          <span className="ml-2 inline-block rounded-md bg-paper/[0.07] px-1.5 py-px align-middle font-mono text-[10px] font-medium text-grey">
            {t(
              locale,
              work.status === "planning"
                ? "works.statusPlanning"
                : work.status === "building"
                  ? "works.statusBuilding"
                  : "works.statusArchived",
            )}
          </span>
        )}
        {work.featuredAt && (
          <span
            className="ml-2 inline-block rounded-md bg-blue/10 px-1.5 py-px align-middle font-mono text-[10px] font-medium text-blue"
            title={`${work.featuredReason ?? ""}${
              work.editorHandle
                ? ` ${t(locale, "featured.by", { handle: work.editorHandle })}`
                : ""
            }`}
          >
            {t(locale, "featured.badge")}
          </span>
        )}
      </h1>
      <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-grey">
        {work.handle ? (
          <>
            <Avatar url={work.avatarUrl} handle={work.handle} size={20} />
            <Link
              href={`/u/${work.handle}`}
              className="text-paper transition-colors hover:text-blue"
            >
              @{work.handle}
            </Link>
          </>
        ) : (
          <span>{t(locale, "awesome.by", { name: work.authorLabel })}</span>
        )}
        <span>{relTime(work.createdAt, locale)}</span>
      </div>

      <div className="mt-6">
        <WorkScreenshot url={work.screenshotUrl} name={work.name} />
      </div>

      {/* 按钮行:体验作品(primary 外链新 tab)/ 支持(登录,乐观更新)/ 分享 / 作者编辑删除 */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        {work.url && (
          <a
            href={work.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue bg-blue px-4 font-mono text-xs font-semibold text-white shadow-lg shadow-blue/25 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <ExternalLink size={13} />
            {t(locale, "works.tryIt")}
          </a>
        )}
        {user ? (
          <WorkVoteButton
            workId={work.id}
            voted={voted}
            count={work.voteCount}
            locale={locale}
          />
        ) : (
          <span
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-4 font-mono text-xs text-grey"
            title={t(locale, "works.loginToSupport")}
          >
            <Heart size={13} />
            {t(locale, "works.support")} · {work.voteCount}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {user && work.userId === user.id && (
            <span className="flex items-center gap-3 font-mono text-[11px] text-grey">
              <WorkOwnerActions
                workId={work.id}
                locale={locale}
                redirectTo={work.source === "awesome" ? "/awesome" : "/works"}
              />
            </span>
          )}
          <ShareButton
            path={`/works/${work.id}`}
            title={work.name}
            locale={locale}
            posterHref={`/api/share/work/${work.id}`}
          />
        </span>
      </div>

      {/* 正文 + 右侧信息栏:<xl 内联显示(窄屏折行);≥xl 由右栏元数据卡取代
          (右栏注册表 work kind),正文占满正常阅读列宽 */}
      <div className="mt-10 grid gap-8 sm:grid-cols-[1fr_180px] xl:grid-cols-1">
        <div>
          {/* 长描述优先(20260824 新增 description_md),缺省回退 tagline */}
          {(work.descriptionMd || work.tagline) && (
            <Markdown source={work.descriptionMd || work.tagline} />
          )}
          {work.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {work.tags.map((tag) => (
                <span
                  key={tag}
                  className="border border-line px-1.5 py-px font-mono text-[10px] text-grey"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-6 border-t border-line pt-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 xl:hidden">
          <div>
            <h3 className="font-mono text-[11px] tracking-wider text-grey">
              {t(locale, "works.sideAuthor")}
            </h3>
            {work.handle ? (
              <Link
                href={`/u/${work.handle}`}
                className="mt-3 flex items-center gap-3 border border-line p-3 transition-colors hover:border-blue"
              >
                <Avatar
                  url={work.avatarUrl}
                  handle={work.handle}
                  size={32}
                  className="shrink-0"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-paper">
                    @{work.handle}
                  </span>
                  {claimBadge !== null && (
                    <span
                      className="mt-1 inline-block border border-emerald-400/60 px-1.5 py-px font-mono text-[10px] text-emerald-400"
                      title={t(locale, "works.badgeTitle")}
                    >
                      {t(locale, "works.badge", {
                        n: compactNumber(claimBadge, locale),
                      })}
                    </span>
                  )}
                </span>
              </Link>
            ) : (
              <p className="mt-3 border border-line p-3 text-sm text-grey">
                {work.authorLabel}
              </p>
            )}
          </div>

          {(work.url || work.repoUrl) && (
            <div>
              <h3 className="font-mono text-[11px] tracking-wider text-grey">
                {t(locale, "works.sideLinks")}
              </h3>
              <div className="mt-3 space-y-2 font-mono text-xs">
                {work.url && (
                  <a
                    href={work.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 break-all text-blue underline-offset-4 hover:underline"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                    {t(locale, "works.visit")}
                  </a>
                )}
                {work.repoUrl && (
                  <a
                    href={work.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 break-all text-grey transition-colors hover:text-blue"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                    {t(locale, "works.repo")}
                  </a>
                )}
              </div>
            </div>
          )}

          {work.agents.length > 0 && (
            <div>
              <h3 className="font-mono text-[11px] tracking-wider text-grey">
                {t(locale, "works.agents")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {work.agents.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[10px] text-grey"
                  >
                    <AgentIcon id={a} size={13} />
                    {agentName(a)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {work.kind && (
            <div>
              <h3 className="font-mono text-[11px] tracking-wider text-grey">
                {t(locale, "works.kind")}
              </h3>
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] ${workKind(work.kind).tint}`}>
                  <i className={`size-[6px] rounded-full ${workKind(work.kind).dot}`} />
                  {workKindLabel(work.kind, locale === "zh")}
                </span>
              </div>
            </div>
          )}

          {work.models.length > 0 && (
            <div>
              <h3 className="font-mono text-[11px] tracking-wider text-grey">
                {t(locale, "works.sideModels")}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {work.models.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1.5 rounded-md bg-paper/[0.05] px-2 py-1 font-mono text-[10px] text-grey"
                  >
                    <ModelIcon id={m} size={13} />
                    {modelFamilyName(m)}
                  </span>
                ))}
              </div>
            </div>
          )}


          <div>
            <h3 className="font-mono text-[11px] tracking-wider text-grey">
              {t(locale, "works.sideInfo")}
            </h3>
            <div className="mt-3 space-y-1.5 font-mono text-[11px] text-grey">
              <div className="flex items-center justify-between gap-2">
                <span>{t(locale, "works.published")}</span>
                <span>{relTime(work.createdAt, locale)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>{t(locale, "works.support")}</span>
                <span className="inline-flex items-center gap-1">
                  <Heart size={11} />
                  {work.voteCount}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* 评论区:与作者聊聊这个作品(单层;登录可发,限流;作者/作品作者可删) */}
      <section>
        <h2 id="comments" className="mt-12 font-mono text-sm text-grey">
          {t(locale, "works.discuss")} ·{" "}
          {t(locale, "post.comments", { n: comments.total })}
        </h2>
        {comments.nodes.length === 0 ? (
          <p className="mt-6 text-sm text-grey">
            {t(locale, "works.noComments")}
          </p>
        ) : (
          /* LoadMore 在容器内:追加页直接落进 space-y 流(同作品墙网格语义) */
          <div className="mt-6 space-y-6">
            {comments.nodes}
            {/* key 带首屏规模与游标:发/删评论触发 refresh 后首屏一变即 remount,
                已追加的页作废(同作品墙/评论区语义) */}
            <LoadMore
              key={`wc-${comments.nodes.length}-${comments.nextCursor ?? "end"}-${locale}`}
              initialCursor={comments.nextCursor}
              load={loadMoreWorkCommentsAction.bind(null, workId)}
              locale={locale}
            />
          </div>
        )}
        {user ? (
          <WorkCommentForm workId={workId} locale={locale} />
        ) : (
          <p className="mt-8 border-t border-line pt-6 text-sm text-grey">
            {t(locale, "post.loginToComment")}
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
          </p>
        )}
      </section>
    </div>
  );
}
