/* 拦截 /blog/admin/new:explore 页头「发内容」就地弹窗;直接访问/刷新仍走
   完整页(app/(app)/blog/admin/new/page.tsx)。内容与完整页共用
   NewArticleContent(与作品发布的拦截弹窗同一形态)。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import NewArticleContent from "@/app/(app)/blog/admin/new/_components/NewArticleContent";

export default async function NewArticleModalPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "artf.newTitle")}
      closeLabel={t(locale, "modal.close")}
      widthCls="w-[min(94vw,56rem)]"
      dirtyGuard={{
        title: t(locale, "modal.dirtyTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.discardClose"),
      }}
    >
      <NewArticleContent showTitle={false} />
    </RouteModal>
  );
}
