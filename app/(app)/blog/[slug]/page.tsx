/* 月刊详情已并入探索区(20260821):/blog/<slug> → /explore/<slug>(?tab= 透传)。 */
import { redirect } from "next/navigation";

export default async function LetterRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab = rawTab ? `?tab=${encodeURIComponent(rawTab)}` : "";
  redirect(`/explore/${slug}${tab}`);
}
