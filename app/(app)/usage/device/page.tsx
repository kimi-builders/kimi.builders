/* The connect-device page (the full page on direct access/refresh);
   in-app clicks render the intercepted-route modal
   (app/(app)/@modal/(.)usage/device) — both share
   UsageDeviceContent. */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import UsageDeviceContent from "./_components/UsageDeviceContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.device") };
}

export default function UsageDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  return <UsageDeviceContent searchParams={searchParams} />;
}
