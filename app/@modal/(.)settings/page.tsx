/* Intercepts /settings: in-app "settings" clicks render a modal;
   direct access/refresh still gets the full page
   (app/(app)/settings/page.tsx). Both share SettingsContent. */
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
