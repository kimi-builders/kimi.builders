/* Intercepts /community/[id]/edit: in-app "edit" clicks render a
   modal; direct access/refresh still gets the full page
   (app/(app)/community/[id]/edit/page.tsx). Both share
   EditPostContent; the non-owner 404 also lives in the content
   component. */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import EditPostContent from "@/app/(app)/community/[id]/edit/_components/EditPostContent";

export default async function EditPostModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "edit.pageTitle")}
      closeLabel={t(locale, "modal.close")}
      dirtyGuard={{
        title: t(locale, "modal.dirtyTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.discardClose"),
      }}
    >
      <EditPostContent params={params} showTitle={false} />
    </RouteModal>
  );
}
