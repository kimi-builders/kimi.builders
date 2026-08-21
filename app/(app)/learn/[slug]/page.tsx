/* 教程系列页已并入探索区(20260821):/learn/<slug> → /explore/series/<slug>。 */
import { redirect } from "next/navigation";

export default async function LearnSeriesRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/explore/series/${slug}`);
}
