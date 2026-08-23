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
    /* 50rem matches the shortcuts/search shells (KeyboardShortcuts):
       wide enough that the widest picker label plus its "default"
       badge (EN "Classic Default") stays on one line inside its tile. */
    <RouteModal
      title={t(locale, "set.title")}
      closeLabel={t(locale, "modal.close")}
      widthCls="w-[min(92vw,50rem)]"
    >
      <SettingsContent showTitle={false} />
    </RouteModal>
  );
}
