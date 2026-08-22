/* Usage loading state: folded into the (app) group's in-column
   boundary — the shell and rail persist across page changes, no more
   full-page swaps. */
import RouteLoading from "../_components/RouteLoading";
import { cookies } from "next/headers";
import type { Locale } from "@/src/lib/i18n";

export default async function UsageLoading() {
  const c = (await cookies()).get("kb_locale")?.value;
  const locale: Locale = c === "en" ? "en" : "zh";
  return <RouteLoading locale={locale} />;
}
