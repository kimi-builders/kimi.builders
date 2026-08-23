/* The edit-work page (the full page on direct access/refresh); in-app
   clicks render the intercepted-route modal
   (app/(app)/@modal/(.)works/[id]/edit) — both share EditWorkContent. */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import EditWorkContent from "./_components/EditWorkContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.editWork") };
}

export default function EditWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditWorkContent params={params} />;
}
