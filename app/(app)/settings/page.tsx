/* 设置页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)settings),两者共用 SettingsContent。
   透传 OAuth 绑定回执(?linked / ?link_error&p)给「账号」页签。 */
import type { Metadata } from "next";
import SettingsContent from "./_components/SettingsContent";

export const metadata: Metadata = { title: "设置 — kimi.builders" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string; p?: string }>;
}) {
  const { linked, link_error, p } = await searchParams;
  return <SettingsContent linked={linked} linkError={link_error} linkProvider={p} />;
}
