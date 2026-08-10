/* 拦截 /settings:应用内点击「设置」以弹窗呈现;直接访问/刷新仍走完整页
   (app/(app)/settings/page.tsx)。内容与完整页共用 SettingsContent。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import SettingsContent from "@/app/(app)/settings/_components/SettingsContent";

export default async function SettingsModalPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal title={t(locale, "set.title")} closeLabel={t(locale, "modal.close")}>
      <SettingsContent showTitle={false} />
    </RouteModal>
  );
}
