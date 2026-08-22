/* The tutorial series page merged into explore: /learn/<slug> ->
   /explore/series/<slug>. */
import { redirect } from "next/navigation";

export default async function LearnSeriesRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/explore/series/${slug}`);
}
