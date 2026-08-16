/* 用量中心加载态:并入 (app) 组级列内边界(20260815 评审),
   壳层与右栏在换页时保持,不再整页换脸。 */
import RouteLoading from "../_components/RouteLoading";
import { cookies } from "next/headers";
import type { Locale } from "@/src/lib/i18n";

export default async function UsageLoading() {
  const c = (await cookies()).get("kb_locale")?.value;
  const locale: Locale = c === "en" ? "en" : "zh";
  return <RouteLoading locale={locale} />;
}
