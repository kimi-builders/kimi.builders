/* Awesome Kimi(占位):全世界用 Kimi 构建的项目合集,与 awesome 仓库联动。 */
import type { Metadata } from "next";
import { Star } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import SoonPage from "../_components/SoonPage";

export const metadata: Metadata = { title: "Awesome — kimi.builders" };

export default async function AwesomePage() {
  const locale = await getLocale(await getSessionUser());
  return (
    <SoonPage
      icon={Star}
      name={t(locale, "nav.awesome")}
      desc={t(locale, "soon.awesome.desc")}
      items={t(locale, "soon.awesome.items").split("\n")}
      locale={locale}
    />
  );
}
