import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getUiPrefs } from "@/src/lib/prefs";
import Toaster from "@/components/Toaster";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-jetbrains",
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
}: Readonly<{ children: React.ReactNode }>) {
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
        <Toaster />
      </body>
    </html>
  );
}
