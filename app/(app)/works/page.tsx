/* 作品库(占位):成员作品墙,与「晒作品」板块和 Awesome 列表联动。 */
import type { Metadata } from "next";
import { Rocket } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import SoonPage from "../_components/SoonPage";

export const metadata: Metadata = { title: "作品库 — kimi.builders" };

export default async function WorksPage() {
  const locale = await getLocale(await getSessionUser());
  return (
    <SoonPage
      icon={Rocket}
      name={t(locale, "nav.works")}
      desc={t(locale, "soon.works.desc")}
      items={t(locale, "soon.works.items").split("\n")}
      locale={locale}
    />
  );
}
