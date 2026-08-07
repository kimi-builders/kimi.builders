import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={jetbrains.variable}>
      <body>{children}</body>
    </html>
  );
}
