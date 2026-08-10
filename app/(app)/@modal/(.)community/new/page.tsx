/* 拦截 /community/new:应用内点击「发帖」以弹窗呈现;直接访问/刷新仍走完整页
   (app/(app)/community/new/page.tsx)。内容与完整页共用 NewPostContent。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "../../../_components/RouteModal";
import NewPostContent from "../../../community/new/_components/NewPostContent";

export default async function NewPostModalPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal title={t(locale, "form.pageTitle")} closeLabel={t(locale, "modal.close")}>
      <NewPostContent showTitle={false} />
    </RouteModal>
  );
}
