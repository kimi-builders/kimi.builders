/* Landing for emailed reset links: /login/reset?token=... ->
   /login?mode=reset&token=... Email URLs stay short and stable; every
   view lives in the login page's mode. */
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/src/lib/auth/return-to";

export default async function ResetEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = raw && /^[0-9a-f]{64}$/.test(raw) ? raw : "";
  /* next pass-through: the emailed link carries the redirect target
     from the forgot-password form. */
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeReturnTo(rawNext);
  redirect(
    `/login?mode=reset${token ? `&token=${token}` : ""}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`,
  );
}
