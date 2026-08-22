/* The connect-device page (the full page on direct access/refresh);
   in-app clicks render the intercepted-route modal
   (app/(app)/@modal/(.)usage/device) — both share
   UsageDeviceContent. */
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
