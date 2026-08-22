/* Edit-work body: shared by the full page (/works/[id]/edit) and the
   modal (@modal/(.)works/[id]/edit). showTitle=false collapses the h1
   (the modal has its own title bar). Author-only: the server checks
   ownership after loading and shows an error otherwise. Claims: the
   field context = the verifiable total - claims on other works
   (excluding this one); a suggestion prefill appears when the author
   enabled upload_project and a project label matches the work name
   (pure convenience). When a shrunk total puts the sum of claims over
   it, the author sees the redistribution hint here. */
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
  /* The over-cap hint judges by the full sum of claims including this
     work (allowance.claimed already excludes it). */
  const paused = claimsPaused(
    allowance.total,
    allowance.claimed + (work.claimedTokens ?? 0),
  );
  /* Suggestion prefill: works with an existing claim get no
     suggestion (the claim itself is the author's ruling). */
  const suggested =
    work.claimedTokens === null && allowance.total > 0
      ? matchSuggestedClaim(work.name, await getSuggestedClaimProjects(user.id))
      : null;

  return (
    <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
      {showTitle && (
        /* Layout alignment: the header takes eyebrow + .kb-h2. */
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
        /* Media backfill: key -> public URL assembled here
           (server-side). */
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
