/* The new-post page (the full page on direct access/refresh); in-app
   clicks render the intercepted-route modal
   (app/(app)/@modal/(.)community/new) — both share NewPostContent. */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import NewPostContent from "./_components/NewPostContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.newPost") };
}

export default function NewPostPage() {
  return <NewPostContent />;
}
