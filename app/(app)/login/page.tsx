/* The login/signup page (the full page on direct access/refresh);
   in-app clicks render the intercepted-route modal
   (app/(app)/@modal/(.)login) — both share LoginContent. */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import LoginContent from "./_components/LoginContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.login") };
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LoginContent searchParams={searchParams} />;
}
