/* 设置页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)settings),两者共用 SettingsContent。 */
import type { Metadata } from "next";
import SettingsContent from "./_components/SettingsContent";

export const metadata: Metadata = { title: "设置 — kimi.builders" };

export default function SettingsPage() {
  return <SettingsContent />;
}
