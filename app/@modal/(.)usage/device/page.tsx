/* 拦截 /usage/device:应用内进入「连接用量设备」以弹窗呈现;直接访问/刷新(如
   终端 init 打开的链接)仍走完整页(app/(app)/usage/device/page.tsx)。
   内容与完整页共用 UsageDeviceContent。 */
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
