/* Intercepts /community/new: in-app "post" clicks render a modal;
   direct access/refresh still gets the full page
   (app/(app)/community/new/page.tsx). Both share NewPostContent. */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import NewPostContent from "@/app/(app)/community/new/_components/NewPostContent";

export default async function NewPostModalPage() {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "form.pageTitle")}
      closeLabel={t(locale, "modal.close")}
      /* The post form auto-saves a local draft (community-draft.ts), so
         closing never discards: the confirm says the draft stays and
         the close button keeps neutral styling (nothing is lost).
         destructive:false — this is not a discard action. */
      dirtyGuard={{
        title: t(locale, "modal.draftCloseTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.draftCloseKeep"),
        destructive: false,
      }}
    >
      <NewPostContent showTitle={false} />
    </RouteModal>
  );
}
