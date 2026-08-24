/* Root loading boundary (direct URLs hit this before the (app) shell
   exists). Locale reads only the kb_locale cookie — loading boundaries
   must be fast: no session fetch, no Accept-Language parsing (same
   shortcut as the (app) group loading boundary). */
import { cookies } from "next/headers";
import BrandLoading from "@/components/BrandLoading";
import type { Locale } from "@/src/lib/i18n";

export default async function Loading() {
  const c = (await cookies()).get("kb_locale")?.value;
  const locale: Locale = c === "en" ? "en" : "zh";
  return <BrandLoading locale={locale} />;
}
