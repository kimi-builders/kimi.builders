/* 用量看板(占位):本地脚本统计 token 用量,授权同步后按天出曲线。 */
import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import SoonPage from "../_components/SoonPage";

export const metadata: Metadata = { title: "用量 — kimi.builders" };

export default async function UsagePage() {
  const locale = await getLocale(await getSessionUser());
  return (
    <SoonPage
      icon={BarChart3}
      name={t(locale, "nav.usage")}
      desc={t(locale, "soon.usage.desc")}
      items={t(locale, "soon.usage.items").split("\n")}
      locale={locale}
    />
  );
}
