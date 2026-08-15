/* 作品详情(P1-2,20260813 改版):面包屑 + 干净 H1 + meta 行(作者/时间/类型/
   声明投入/★精选;私密/屏蔽警示 pill)+ 操作条(体验/支持/分享/作者与治理操作)
   + 图集 + 长描述 + label/value hairline 信息栏(<xl 内联;≥xl 由右栏 Work Info 卡取代,
   见右栏注册表 work kind)+ 底部单层评论区。
   浏览无需登录;支持/评论需登录(comment/vote 配额限流)。AI 不介入作品评论。
   不存在/已删作品给友好文案,不 404 硬错。 */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, ExternalLink, GalleryVerticalEnd, Heart, MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import AgentIcon from "@/components/AgentIcon";
import LoadMore from "@/components/LoadMore";
import Markdown from "@/components/Markdown";
import ModelIcon from "@/components/ModelIcon";
import ShareButton from "@/components/ShareButton";
import WorkKindIcon from "@/components/WorkKindIcon";
import { agentName } from "@/src/lib/agents";
import { trackEvent } from "@/src/lib/analytics";
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { compactNumber, relTime } from "@/src/lib/format";
import { t, type Locale } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { modelFamilyName } from "@/src/lib/model-families";
import { mediaUrl } from "@/src/lib/storage";
import { workKindLabel } from "@/src/lib/work-kinds";
import {
  canViewWork,
  claimBadgeOf,
  getAuthorClaimContext,
  getWork,
  getWorkDetail,
  hasWorkVote,
} from "@/src/lib/works";
import { loadMoreWorkCommentsAction } from "../actions";
import { loadWorkComments } from "../_components/work-comment-page";
import WorkCommentForm from "../_components/WorkCommentForm";
import WorkGallery from "../_components/WorkGallery";
import WorkOwnerActions from "../_components/WorkOwnerActions";
import WorkScreenshot from "../_components/WorkScreenshot";
import WorkVoteButton from "../_components/WorkVoteButton";
import ModToolbar from "../../admin/_components/ModToolbar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const work = await getWork(Number(id) || 0);
  if (!work) return { title: "kimi.builders" };
  /* 私密作品不向非作者泄露标题;被屏蔽作品不向非作者/非管理泄露(标签页标题/分享预览都算) */
  const user = await getSessionUser();
  if (!canViewWork(work, user)) return { title: "kimi.builders" };
  return { title: `${work.name} — kimi.builders` };
}

/* 不存在/已撤下:友好文案 + 回作品墙,不硬 404。 */
function WorkGone({ locale }: { locale: Locale }) {
  return (
    <div className="mt-10 rounded-2xl border border-line bg-card p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-moon text-blue">
        <GalleryVerticalEnd size={23} aria-hidden="true" />
      </span>
      <p className="text-sm leading-relaxed text-grey">
        {t(locale, "works.notFound")}
      </p>
      <Link
        href="/works"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 font-mono text-xs text-grey transition-colors hover:border-blue hover:text-blue"
      >
        <ArrowLeft size={13} aria-hidden="true" />
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
  /* 私密作品对他人按「不存在」处理;被屏蔽作品仅作者与 admin/mod 可开(治理评审),
     其余按同一友好文案(与已删/不存在一致,不构成存在性 oracle)。 */
  if (!work || !canViewWork(work, user))
    return <WorkGone locale={locale} />;
  const requestHeaders = await headers();
  trackEvent("work_view", { kind: "work", id: workId }, { headers: requestHeaders });

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
      <article className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      {work.hiddenAt && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs leading-relaxed text-red-400">
          {t(locale, "mod.hiddenBanner")}
          {work.hiddenReason ? ` — ${work.hiddenReason}` : ""}
        </p>
      )}
      {/* 面包屑:作品(awesome 条目回 /awesome)/ 名称 */}
      <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-grey">
        <Link
          href={work.source === "awesome" ? "/awesome" : "/works"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-moon hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {t(locale, work.source === "awesome" ? "nav.awesome" : "nav.works")}
        </Link>
        <span className="truncate">{work.name}</span>
      </div>

      {/* 标题行:H1 保持干净,徽标全部移到下方 meta 行(20260813 改版) */}
      <div className="mt-4 flex items-start gap-3">
        {work.logoKey && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mediaUrl(work.logoKey)}
            alt=""
            className="mt-0.5 size-11 shrink-0 rounded-lg border border-line object-cover"
          />
        )}
        <h1 className="text-2xl font-semibold leading-snug">
          {work.name}
        </h1>
      </div>
      {/* meta 行:作者 · 时间 · 类型 · 口径/状态 · 声明投入(蓝) · ★精选(蓝);
          私密/屏蔽保留警示 pill(仅作者/治理可见) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[11px] text-grey">
        {work.source === "awesome" && work.authorLabel ? (
          <>
            {/* 原作者可点跳 GitHub 主页(句柄形状校验,非句柄降级纯文本);
                推荐人在详情页保留(列表卡片不显示,2026-08-14 决定) */}
            {/^[A-Za-z0-9-]{1,39}$/.test(work.authorLabel) ? (
              <a
                href={`https://github.com/${work.authorLabel}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-paper transition-colors hover:text-blue"
              >
                {t(locale, "awesome.by", { name: work.authorLabel })}
              </a>
            ) : (
              <span>{t(locale, "awesome.by", { name: work.authorLabel })}</span>
            )}
            {work.handle && (
              <span className="inline-flex items-center gap-1.5">
                · {t(locale, "awesome.recommenderShort")}
                <Avatar url={work.avatarUrl} handle={work.handle} size={20} />
                <Link
                  href={`/u/${work.handle}`}
                  className="text-paper transition-colors hover:text-blue"
                >
                  @{work.handle}
                </Link>
              </span>
            )}
          </>
        ) : work.handle ? (
          <span className="inline-flex items-center gap-1.5">
            <Avatar url={work.avatarUrl} handle={work.handle} size={20} />
            <Link
              href={`/u/${work.handle}`}
              className="text-paper transition-colors hover:text-blue"
            >
              @{work.handle}
            </Link>
          </span>
        ) : (
          <span>{t(locale, "awesome.by", { name: work.authorLabel })}</span>
        )}
        <span>· {relTime(work.createdAt, locale)}</span>
        <span className="inline-flex items-center gap-1">
          · <WorkKindIcon id={work.kind} size={11} />
          {workKindLabel(work.kind, locale === "zh")}
        </span>
        {work.scope && (
          <span>
            · {t(
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
          <span>
            · {t(
              locale,
              work.status === "planning"
                ? "works.statusPlanning"
                : work.status === "building"
                  ? "works.statusBuilding"
                  : "works.statusArchived",
            )}
          </span>
        )}
        {claimBadge !== null && (
          <span className="text-blue" title={t(locale, "works.badgeTitle")}>
            · {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
          </span>
        )}
        {work.featuredAt && (
          <span
            className="text-blue"
            title={`${work.featuredReason ?? ""}${
              work.editorHandle
                ? ` ${t(locale, "featured.by", { handle: work.editorHandle })}`
                : ""
            }`}
          >
            · ★ {t(locale, "featured.badge")}
          </span>
        )}
        {work.visibility === "private" && (
          <span className="inline-block rounded-md border border-line px-1.5 py-px font-mono text-[10px] font-medium text-grey">
            {t(locale, "works.private")}
          </span>
        )}
        {work.hiddenAt && (
          <span
            className="inline-block rounded-md border border-red-400/60 px-1.5 py-px font-mono text-[10px] font-medium text-red-400"
            title={work.hiddenReason ?? undefined}
          >
            {t(locale, "mod.hiddenBadge")}
          </span>
        )}
      </div>

      {/* 操作条(媒体之上):体验作品(primary 外链新 tab)/ 支持(登录,乐观更新)/ 分享 / 作者编辑删除 */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
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
          {/* 治理工具条:admin/mod(屏蔽/解除;硬删仅 admin),action 层再鉴权 */}
          {user && canModerate(user.role) && (
            <ModToolbar
              targetType="work"
              targetId={work.id}
              hidden={!!work.hiddenAt}
              isAdmin={user.role === "admin"}
              locale={locale}
              redirectAfter={work.source === "awesome" ? "/awesome" : "/works"}
            />
          )}
          <ShareButton
            path={`/works/${work.id}`}
            title={work.name}
            locale={locale}
            /* 私密作品无海报(路由 404):按钮直接不带海报入口,同私密帖口径 */
            posterHref={
              work.visibility === "public"
                ? `/api/share/work/${work.id}`
                : undefined
            }
            posterSurface={work.visibility === "public" ? "work" : undefined}
          />
        </span>
      </div>

      {/* 媒体区:有配图走图集(封面大图 + 缩略图);只有存量外链截图则单张直出;
          都没有就不渲染——生成的名称砖是列表封面的兜底,详情页头部已有
          logo + 名称,再放同一块砖是重复(20260908) */}
      {(work.imageKeys.length > 0 || work.screenshotUrl) && (
        <div className="mt-5">
          {work.imageKeys.length > 0 ? (
            <WorkGallery
              keys={work.imageKeys}
              name={work.name}
              locale={locale}
              fit={work.coverFit}
            />
          ) : (
            <WorkScreenshot
              url={work.screenshotUrl}
              name={work.name}
              logoUrl={work.logoKey ? mediaUrl(work.logoKey) : ""}
            />
          )}
        </div>
      )}

      {/* 正文 + 右侧信息栏:<xl 内联显示(窄屏折行);≥xl 由右栏元数据卡取代
          (右栏注册表 work kind),正文占满正常阅读列宽 */}
      <div className="mt-10 grid gap-8 sm:grid-cols-[1fr_220px] xl:grid-cols-1">
        <div>
          {/* 长描述优先(20260824 新增 description_md),缺省回退 tagline */}
          {(work.descriptionMd || work.tagline) && (
            <Markdown source={work.descriptionMd || work.tagline} />
          )}
        </div>

        {/* 内联信息栏(<xl):与右栏同款 label/value hairline 行 */}
        <aside className="border-t border-line pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 xl:hidden">
          <dl className="font-mono text-[11px]">
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">
                {t(locale, work.source === "awesome" && work.authorLabel ? "works.sideOriginalAuthor" : "works.sideAuthor")}
              </dt>
              <dd className="min-w-0 text-paper">
                {work.source === "awesome" && work.authorLabel ? (
                  <span className="truncate">{work.authorLabel}</span>
                ) : work.handle ? (
                  <Link
                    href={`/u/${work.handle}`}
                    className="flex items-center gap-1.5 transition-colors hover:text-blue"
                  >
                    <Avatar url={work.avatarUrl} handle={work.handle} size={18} className="shrink-0" />
                    <span className="truncate">@{work.handle}</span>
                  </Link>
                ) : (
                  <span className="truncate">{work.authorLabel}</span>
                )}
              </dd>
            </div>
            {claimBadge !== null && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <dt className="text-grey">{t(locale, "works.declared")}</dt>
                <dd className="text-blue" title={t(locale, "works.badgeTitle")}>
                  {t(locale, "works.badge", { n: compactNumber(claimBadge, locale) })}
                </dd>
              </div>
            )}
            {work.agents.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <dt className="shrink-0 text-grey">{t(locale, "works.agents")}</dt>
                <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-paper">
                  {work.agents.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1">
                      <AgentIcon id={a} size={11} />
                      {agentName(a)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">{t(locale, "works.kind")}</dt>
              <dd className="inline-flex items-center gap-1 text-paper">
                <WorkKindIcon id={work.kind} size={11} />
                {workKindLabel(work.kind, locale === "zh")}
              </dd>
            </div>
            {work.models.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <dt className="shrink-0 text-grey">{t(locale, "works.sideModels")}</dt>
                <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-paper">
                  {work.models.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1">
                      <ModelIcon id={m} size={11} />
                      {modelFamilyName(m, locale)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {work.tags.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <dt className="shrink-0 text-grey">{t(locale, "works.tagsShort")}</dt>
                <dd className="min-w-0 truncate text-right text-paper" title={work.tags.join(", ")}>
                  {work.tags.join(", ")}
                </dd>
              </div>
            )}
            {(work.url || work.repoUrl) && (
              <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <dt className="text-grey">{t(locale, "works.sideLinks")}</dt>
                <dd className="inline-flex items-center gap-3">
                  {work.url && (
                    <a href={work.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue underline-offset-4 hover:underline">
                      <ExternalLink size={11} />
                      {t(locale, "works.visit")}
                    </a>
                  )}
                  {work.repoUrl && (
                    <a href={work.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-grey transition-colors hover:text-blue">
                      <ExternalLink size={11} />
                      {t(locale, "works.repo")}
                    </a>
                  )}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <dt className="text-grey">{t(locale, "works.published")}</dt>
              <dd className="text-paper">{relTime(work.createdAt, locale)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-grey">{t(locale, "works.support")}</dt>
              <dd className="inline-flex items-center gap-1 text-paper">
                <Heart size={11} />
                {work.voteCount}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
      </article>

      {/* 评论区:与作者聊聊这个作品(单层;登录可发,限流;作者/作品作者可删) */}
      <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <h2 id="comments" className="font-mono text-sm font-semibold text-paper">
          {t(locale, "works.discuss")} ·{" "}
          {t(locale, "post.comments", { n: comments.total })}
        </h2>
        {comments.nodes.length === 0 ? (
          <p className="mt-5 flex items-center justify-center gap-2 py-6 text-center text-sm text-grey">
            <MessageCircle size={15} className="text-grey/70" aria-hidden="true" />
            {t(locale, "works.noComments")}
          </p>
        ) : (
          /* LoadMore 在容器内:追加页直接落进分隔流;评论行不套圆角盒,hairline 分隔 */
          <div className="mt-4 divide-y divide-line">
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
          <p className="mt-4 border-t border-line pt-4 text-sm text-grey">
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
