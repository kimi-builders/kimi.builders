/* 编辑作品主体:完整页(/works/[id]/edit)与弹窗(@modal/(.)works/[id]/edit)
   共用。showTitle=false 时收起 h1(弹窗自带标题栏)。
   仅作者:加载后服务端先验归属,不是自己的直接给错误提示。
   声明制(20260822_work_claims):声明字段上下文 = 可验证总量 − 其他作品已声明
   (排除本作品);作者开了 upload_project 且项目 label 与作品名匹配时给建议
   预填值(纯省事)。总量缩水使 Σ声明 > 总量时,作者在此看到重新分配提示。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { mediaUrl } from "@/src/lib/storage";
import { getSuggestedClaimProjects } from "@/src/lib/usage/verifiable";
import {
  claimsPaused,
  getClaimAllowance,
  getWork,
  matchSuggestedClaim,
} from "@/src/lib/works";
import { updateWorkAction } from "../../../actions";
import WorkForm from "../../../_components/WorkForm";

export default async function EditWorkContent({
  params,
  showTitle = true,
}: {
  params: Promise<{ id: string }>;
  showTitle?: boolean;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const work = await getWork(Number(id) || 0);

  if (!user || !work || work.userId !== user.id) {
    return (
      <p className="mt-12 rounded-2xl border border-line bg-card p-8 text-center text-sm text-grey">
        {t(locale, "err.notOwnerWork")}
      </p>
    );
  }

  const allowance = await getClaimAllowance(user.id, work.id);
  /* 超额提示按含本作品的完整 Σ声明 判定(allowance.claimed 已排除本作品) */
  const paused = claimsPaused(
    allowance.total,
    allowance.claimed + (work.claimedTokens ?? 0),
  );
  /* 建议预填:已有声明的作品不再给建议(声明值本身就是作者定夺) */
  const suggested =
    work.claimedTokens === null && allowance.total > 0
      ? matchSuggestedClaim(work.name, await getSuggestedClaimProjects(user.id))
      : null;

  return (
    <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
      {showTitle && (
        /* 20260819 版式对齐:页头接入 eyebrow + .kb-h2 */
        <div>
          <p className="kb-eyebrow">{t(locale, "works.editEyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "works.editTitle")}
          </h1>
        </div>
      )}
      {paused && (
        <p className="mt-4 rounded-xl border border-line bg-moon px-3 py-2 font-mono text-xs leading-relaxed text-grey">
          {t(locale, "works.claimPaused")}
        </p>
      )}
      <WorkForm
        action={updateWorkAction}
        locale={locale}
        workId={work.id}
        modal={!showTitle}
        initial={{
          name: work.name,
          tagline: work.tagline,
          url: work.url,
          repoUrl: work.repoUrl,
          screenshotUrl: work.screenshotUrl,
          tags: work.tags,
          agents: work.agents,
          authorLabel: work.authorLabel,
          visibility: work.visibility,
          status: work.status,
          models: work.models,
          kind: work.kind,
          descriptionMd: work.descriptionMd,
          scope: work.scope,
          alsoAwesome: work.alsoAwesome,
          aiReply: work.aiReply,
        }}
        claim={{
          initial: work.claimedTokens,
          hasUsage: allowance.total > 0,
          remaining: allowance.remaining,
          suggested,
        }}
        /* 媒体回填(20260826_work_media):key → 公开 URL 在此(服务端)拼好 */
        media={{
          logo: work.logoKey ? { key: work.logoKey, url: mediaUrl(work.logoKey) } : null,
          images: work.imageKeys.map((k) => ({ key: k, url: mediaUrl(k) })),
          cover: work.coverKey ? { key: work.coverKey, url: mediaUrl(work.coverKey) } : null,
          tone: work.coverTone,
          fit: work.coverFit,
        }}
      />
    </div>
  );
}
