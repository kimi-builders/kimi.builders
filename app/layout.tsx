import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { getUiPrefs } from "@/src/lib/prefs";
import Toaster from "@/components/Toaster";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import "./globals.css";

/* Localized fonts: Google Fonts edge flakiness once broke CI builds;
   with the font files vendored, builds no longer need the network. */
const jetbrains = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/JetBrainsMono-600-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-jetbrains",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = t(locale, "site.metaTitle");
  const description = t(locale, "site.metaDescription");
  return {
    title,
    description,
    metadataBase: new URL("https://kimi.builders"),
    openGraph: {
      title,
      description,
      siteName: "kimi.builders",
      type: "website",
      url: "https://kimi.builders",
    },
    twitter: { card: "summary", title, description },
  };
}

/* viewport-fit=cover: enables env(safe-area-inset-*), so the bottom
   tab bar yields to the iPhone home bar. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  const user = await getSessionUser();
  const [locale, prefs] = await Promise.all([getLocale(user), getUiPrefs()]);
  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      data-theme={prefs.theme}
      data-vibe={prefs.vibe}
      data-nav={prefs.navCollapsed ? "1" : "0"}
      data-sidebar={prefs.sidebarHidden ? "0" : "1"}
      /* Manual reduced motion (kb_motion=reduce): following the system
         emits no attribute; globals.css's media query backstops it. */
      {...(prefs.motion === "reduce" ? { "data-motion": "reduce" } : {})}
      className={jetbrains.variable}
      // Browser extensions inject attributes into <html>/<body> before
      // hydration (e.g. data-redeviation-bs-uid) — external noise;
      // suppress the warning.
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        {children}
        {/* Interception-route modal slot (@modal lives at the root level so (app)/template cannot wrap the parallel slot) */}
        {modal}
        <Toaster />
        {/* Global shortcut layer (listener + help panel; the buttons live in TopBar/home) */}
        <KeyboardShortcuts locale={locale} />
      </body>
    </html>
  );
}
