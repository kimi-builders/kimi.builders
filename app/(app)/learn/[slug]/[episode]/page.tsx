/* The tutorial episode detail merged into explore: /learn/<s>/<e> ->
   /explore/<e> (308). */
import { permanentRedirect } from "next/navigation";

export default async function LearnEpisodeRedirectPage({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}) {
  const { episode } = await params;
  permanentRedirect(`/explore/${episode}`);
}
