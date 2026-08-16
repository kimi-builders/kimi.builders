/* (app) 组级加载边界(20260815 评审):软导航换页时三栏壳保持,
   只有主列显示列内加载态;壳层组件(顶栏/左栏/右栏)在 layout 里,
   不随本边界重挂。
   locale 只读 kb_locale cookie(与 getLocale 的最高优先级同源):
   loading 边界要快,不去拉会话/Accept-Language 的完整解析。 */
import { cookies } from "next/headers";
import RouteLoading from "./_components/RouteLoading";
import type { Locale } from "@/src/lib/i18n";

export default async function AppLoading() {
  const c = (await cookies()).get("kb_locale")?.value;
  const locale: Locale = c === "en" ? "en" : "zh";
  return <RouteLoading locale={locale} />;
}
