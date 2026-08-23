/* The edit-post page (the full page on direct access/refresh); in-app
   clicks render the intercepted-route modal
   (app/(app)/@modal/(.)community/[id]/edit) — both share
   EditPostContent. */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import EditPostContent from "./_components/EditPostContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.editPost") };
}

export default function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditPostContent params={params} />;
}
