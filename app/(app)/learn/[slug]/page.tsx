/* The tutorial series page merged into explore: /learn/<slug> ->
   /explore/series/<slug> (308). */
import { permanentRedirect } from "next/navigation";

export default async function LearnSeriesRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/explore/series/${slug}`);
}
