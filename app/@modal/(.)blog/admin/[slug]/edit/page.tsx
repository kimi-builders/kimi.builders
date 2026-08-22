/* Intercepts /blog/admin/[slug]/edit: the detail page's "edit" opens
   in place (saving a draft stays in the modal to keep writing;
   publishing replaces back to the detail and the modal closes
   silently); direct access/refresh still gets the full page
   (app/(app)/blog/admin/[slug]/edit/page.tsx). Both share
   EditArticleContent. */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import EditArticleContent from "@/app/(app)/blog/admin/[slug]/edit/_components/EditArticleContent";

export default async function EditArticleModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={t(locale, "artf.editTitle")}
      closeLabel={t(locale, "modal.close")}
      widthCls="w-[min(94vw,56rem)]"
      dirtyGuard={{
        title: t(locale, "modal.dirtyTitle"),
        keep: t(locale, "modal.keepEditing"),
        discard: t(locale, "modal.discardClose"),
      }}
    >
      <EditArticleContent
        params={params}
        searchParams={searchParams}
        showTitle={false}
      />
    </RouteModal>
  );
}
