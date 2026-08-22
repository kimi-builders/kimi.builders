/* 拦截 /blog/admin/[slug]/edit:详情页「编辑」就地弹窗(存草稿留在弹窗续编,
   发布后 replace 回详情、弹窗静默关);直接访问/刷新仍走完整页
   (app/(app)/blog/admin/[slug]/edit/page.tsx),两者共用 EditArticleContent。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import EditArticleContent from "@/app/(app)/blog/admin/[slug]/edit/_components/EditArticleContent";

export default async function EditArticleModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "artf.editTitle")}
      closeLabel={t(locale, "modal.close")}
      widthCls="w-[min(94vw,56rem)]"
      dirtyGuard={{
        title: t(locale, "modal.dirtyTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.discardClose"),
      }}
    >
      <EditArticleContent
        params={params}
        searchParams={searchParams}
        showTitle={false}
      />
    </RouteModal>
  );
}
