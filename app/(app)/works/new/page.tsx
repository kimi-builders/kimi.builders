/* The submit-work page (the full page on direct access/refresh);
   in-app clicks render the intercepted-route modal
   (app/(app)/@modal/(.)works/new) — both share NewWorkContent.
   ?path=<slug> = the graduation source series (passed through to
   NewWorkContent). */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import NewWorkContent from "./_components/NewWorkContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.newWork") };
}

export default function NewWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string | string[] }>;
}) {
  return <NewWorkContent searchParams={searchParams} />;
}
