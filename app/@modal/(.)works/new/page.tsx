/* Intercepts /works/new: in-app "submit work" clicks render a modal;
   direct access/refresh still gets the full page
   (app/(app)/works/new/page.tsx). Both share NewWorkContent. */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import NewWorkContent from "@/app/(app)/works/new/_components/NewWorkContent";

export default async function NewWorkModalPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "works.newTitle")}
      closeLabel={t(locale, "modal.close")}
      widthCls="w-[min(94vw,56rem)]"
      dirtyGuard={{
        title: t(locale, "modal.dirtyTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.discardClose"),
      }}
    >
      {/* The ?path=<slug> graduation-attribution context is passed through here too */}
      <NewWorkContent showTitle={false} searchParams={searchParams} />
    </RouteModal>
  );
}
