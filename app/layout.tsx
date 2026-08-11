import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getUiPrefs } from "@/src/lib/prefs";
import Toaster from "@/components/Toaster";
import "./globals.css";

/* 本地化字体(2026-08):Google Fonts 边缘节点抖动曾咬挂 CI 构建,
   字体文件入库后构建不再依赖外网。 */
const jetbrains = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/JetBrainsMono-600-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "kimi.builders — Build good things with Kimi.",
  description:
    "An open community of builders creating good things with Kimi. 用 Kimi,构建美好。",
  metadataBase: new URL("https://kimi.builders"),
};

/* viewport-fit=cover:让 env(safe-area-inset-*) 生效(底部标签栏给 iPhone home 条让位) */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal?: React.ReactNode }>) {
  const user = await getSessionUser();
  const [locale, prefs] = await Promise.all([getLocale(user), getUiPrefs()]);
  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-theme={prefs.theme}
      data-nav={prefs.navCollapsed ? "1" : "0"}
      data-sidebar={prefs.sidebarHidden ? "0" : "1"}
      className={jetbrains.variable}
      // 浏览器扩展会在水合前往 <html>/<body> 注入属性（如 data-redeviation-bs-uid）,属外部干扰,抑制告警
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        {children}
        {/* 拦截路由弹窗槽(@modal 在根级:避开 (app)/template 对并行槽的包裹) */}
        {modal}
        <Toaster />
      </body>
    </html>
  );
}
