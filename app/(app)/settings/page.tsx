/* The settings page (the full page on direct access/refresh); in-app
   clicks render the intercepted-route modal (app/(app)/@modal/(.)
   settings) — both share SettingsContent. Passes the OAuth link
   receipt (?linked / ?link_error&p) through to the "account" tab. */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import SettingsContent from "./_components/SettingsContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.settings") };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; link_error?: string; p?: string }>;
}) {
  const { linked, link_error, p } = await searchParams;
  return <SettingsContent linked={linked} linkError={link_error} linkProvider={p} />;
}
