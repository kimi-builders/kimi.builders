/* 拦截 /community/[id]/edit:应用内点击「编辑」以弹窗呈现;直接访问/刷新仍走
   完整页(app/(app)/community/[id]/edit/page.tsx)。内容与完整页共用
   EditPostContent;非作者的 404 判定同样在内容组件内生效。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "../../../../_components/RouteModal";
import EditPostContent from "../../../../community/[id]/edit/_components/EditPostContent";

export default async function EditPostModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal title={t(locale, "edit.pageTitle")} closeLabel={t(locale, "modal.close")}>
      <EditPostContent params={params} showTitle={false} />
    </RouteModal>
  );
}
