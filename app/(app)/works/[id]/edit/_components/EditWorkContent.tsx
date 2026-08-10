/* 编辑作品主体:完整页(/works/[id]/edit)与弹窗(@modal/(.)works/[id]/edit)
   共用。showTitle=false 时收起 h1(弹窗自带标题栏)。
   仅作者:加载后服务端先验归属,不是自己的直接给错误提示。
   声明制(20260822_work_claims):声明字段上下文 = 可验证总量 − 其他作品已声明
   (排除本作品);作者开了 upload_project 且项目 label 与作品名匹配时给建议
   预填值(纯省事)。总量缩水使 Σ声明 > 总量时,作者在此看到重新分配提示。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
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
      <p className="mt-16 text-center text-sm text-grey">
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
    <div>
      {showTitle && (
        <h1 className="font-mono text-lg font-semibold">
          {t(locale, "works.editTitle")}
        </h1>
      )}
      {paused && (
        <p className="mt-4 border border-amber-400/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-amber-400/90">
          {t(locale, "works.claimPaused")}
        </p>
      )}
      <WorkForm
        action={updateWorkAction}
        locale={locale}
        workId={work.id}
        initial={{
          name: work.name,
          tagline: work.tagline,
          url: work.url,
          repoUrl: work.repoUrl,
          screenshotUrl: work.screenshotUrl,
          tags: work.tags,
          agents: work.agents,
          authorLabel: work.authorLabel,
        }}
        claim={{
          initial: work.claimedTokens,
          hasUsage: allowance.total > 0,
          remaining: allowance.remaining,
          suggested,
        }}
      />
    </div>
  );
}
