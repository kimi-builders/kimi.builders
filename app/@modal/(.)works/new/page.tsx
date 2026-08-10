/* 拦截 /works/new:应用内点击「提交作品」以弹窗呈现;直接访问/刷新仍走完整页
   (app/(app)/works/new/page.tsx)。内容与完整页共用 NewWorkContent。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import NewWorkContent from "@/app/(app)/works/new/_components/NewWorkContent";

export default async function NewWorkModalPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal title={t(locale, "works.newTitle")} closeLabel={t(locale, "modal.close")}>
      <NewWorkContent showTitle={false} />
    </RouteModal>
  );
}
