/* 拦截 /works/[id]/edit:应用内点击「编辑」以弹窗呈现;直接访问/刷新仍走
   完整页(app/(app)/works/[id]/edit/page.tsx)。内容与完整页共用
   EditWorkContent;非作者的错误提示同样在内容组件内生效。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import EditWorkContent from "@/app/(app)/works/[id]/edit/_components/EditWorkContent";

export default async function EditWorkModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "works.editTitle")}
      closeLabel={t(locale, "modal.close")}
      widthCls="w-[min(94vw,56rem)]"
      dirtyGuard={{
        title: t(locale, "modal.dirtyTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.discardClose"),
      }}
    >
      <EditWorkContent params={params} showTitle={false} />
    </RouteModal>
  );
}
