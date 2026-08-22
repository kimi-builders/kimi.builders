/* The tutorial episode detail merged into explore: /learn/<s>/<e> ->
   /explore/<e>. */
import { redirect } from "next/navigation";

export default async function LearnEpisodeRedirectPage({
  params,
}: {
  params: Promise<{ slug: string; episode: string }>;
}) {
  const { episode } = await params;
  redirect(`/explore/${episode}`);
}
