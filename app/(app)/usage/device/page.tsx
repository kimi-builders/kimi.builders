/* 连接用量设备页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)usage/device),两者共用 UsageDeviceContent。 */
import type { Metadata } from "next";
import UsageDeviceContent from "./_components/UsageDeviceContent";

export const metadata: Metadata = { title: "连接用量设备 — kimi.builders" };

export default function UsageDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  return <UsageDeviceContent searchParams={searchParams} />;
}
