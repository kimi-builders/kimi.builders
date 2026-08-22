/* The (app) group loading boundary: on soft navigation the
   three-column shell stays and only the main column shows the in-column
   loading state; the shell components (top/left/right) live in the
   layout and don't remount with this boundary. The locale reads only
   the kb_locale cookie (the same top priority as getLocale): loading
   boundaries must be fast — no session fetch, no full
   Accept-Language parsing. */
import { cookies } from "next/headers";
import RouteLoading from "./_components/RouteLoading";
import type { Locale } from "@/src/lib/i18n";

export default async function AppLoading() {
  const c = (await cookies()).get("kb_locale")?.value;
  const locale: Locale = c === "en" ? "en" : "zh";
  return <RouteLoading locale={locale} />;
}
