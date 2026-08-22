/* Auth chip: signed out shows the GitHub / Google entries; signed in
   shows avatar + @handle + sign out. Shared by the home page (top
   right) and the shell's mobile mini bar; compact hides @handle (saves
   width on narrow screens). Copy follows the UI language. */
import { getSessionUser } from "@/src/lib/auth/session";
import Link from "next/link";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import Avatar from "@/components/Avatar";

export default async function AuthChip({ compact = false }: { compact?: boolean }) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (user) {
    return (
      <>
        <Link
          href={`/u/${user.handle}`}
          title={`@${user.handle}`}
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <Avatar
            url={user.avatarUrl}
            handle={user.handle}
            size={28}
            className="transition-opacity hover:opacity-80"
          />
        </Link>
        {!compact && (
          <Link
            href={`/u/${user.handle}`}
            className="text-paper transition-colors hover:text-ui-blue"
          >
            @{user.handle}
          </Link>
        )}
        {/* Sign-out is a form: logout is POST-only, never a GET link that
            prefetch or a cross-site img tag could trigger. */}
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="cursor-pointer text-grey underline underline-offset-4 transition-colors hover:text-ui-blue"
          >
            {t(locale, "auth.logout")}
          </button>
        </form>
      </>
    );
  }
  return (
    /* A single login entry: choosing how to log in belongs to the
       login modal's context — side-by-side GitHub/Google/email in the
       browsing context only piles noise onto the top bar; all three
       live inside the modal. Link soft-navigates -> the in-app /login
       intercepts into a modal, home context included. */
    <Link
      href="/login"
      className="text-paper underline decoration-ui-blue/60 underline-offset-4 transition-colors hover:text-ui-blue"
    >
      {t(locale, "auth.login")}
    </Link>
  );
}
