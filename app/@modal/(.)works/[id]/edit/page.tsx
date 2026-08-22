/* Intercepts /works/[id]/edit: in-app "edit" clicks render a modal;
   direct access/refresh still gets the full page
   (app/(app)/works/[id]/edit/page.tsx). Both share EditWorkContent;
   the non-owner error also lives in the content component. */
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
