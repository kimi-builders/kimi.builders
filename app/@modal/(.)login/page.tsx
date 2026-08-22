/* Intercepts /login: in-app "login" clicks render a modal; direct
   access/refresh still gets the full page (app/(app)/login/page.tsx).
   Both share LoginContent; the signed-in redirect(next) inside the
   content component still applies. The title bar follows the mode
   (login/signup/forgot/reset), parsed by the same loginModeOf as the
   body — no drift. */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import LoginContent, {
  loginModeOf,
  loginTitleKey,
} from "@/app/(app)/login/_components/LoginContent";

export default async function LoginModalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const mode = loginModeOf(await searchParams);
  return (
    <RouteModal
      title={t(locale, loginTitleKey(mode))}
      closeLabel={t(locale, "modal.close")}
      /* The modal width hugs the content: the login card's max-w-sm +
         side padding ~= 26.5rem, matching the full-page card — mode
         switches stay inside the modal with no width jump. */
      widthCls="w-[min(94vw,26.5rem)]"
    >
      <LoginContent searchParams={searchParams} showTitle={false} />
    </RouteModal>
  );
}
