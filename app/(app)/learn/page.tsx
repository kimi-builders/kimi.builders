/* 知识库(占位):内容由 GitHub 公开仓库驱动,正式版落地前先看 SoonPage。 */
import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import SoonPage from "../_components/SoonPage";

export const metadata: Metadata = { title: "知识库 — kimi.builders" };

export default async function LearnPage() {
  const locale = await getLocale(await getSessionUser());
  return (
    <SoonPage
      icon={BookOpen}
      name={t(locale, "nav.learn")}
      desc={t(locale, "soon.learn.desc")}
      items={t(locale, "soon.learn.items").split("\n")}
      locale={locale}
    />
  );
}
