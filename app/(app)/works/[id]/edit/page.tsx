/* 编辑作品(仅作者):加载后服务端先验归属,不是自己的直接给错误提示。 */
import type { Metadata } from "next";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getWork } from "@/src/lib/works";
import { updateWorkAction } from "../../actions";
import WorkForm from "../../_components/WorkForm";

export const metadata: Metadata = { title: "编辑作品 — kimi.builders" };

export default async function EditWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  return (
    <div>
      <h1 className="font-mono text-lg font-semibold">
        {t(locale, "works.editTitle")}
      </h1>
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
      />
    </div>
  );
}
