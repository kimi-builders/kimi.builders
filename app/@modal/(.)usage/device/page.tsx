/* Intercepts /usage/device: in-app "connect device" renders a modal;
   direct access/refresh (e.g. the link opened by the CLI's init) gets
   the full page (app/(app)/usage/device/page.tsx). Both share
   UsageDeviceContent. */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import UsageDeviceContent from "@/app/(app)/usage/device/_components/UsageDeviceContent";

export default async function UsageDeviceModalPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={locale === "zh" ? "连接用量设备" : "Connect usage device"}
      closeLabel={t(locale, "modal.close")}
    >
      <UsageDeviceContent searchParams={searchParams} showTitle={false} />
    </RouteModal>
  );
}
