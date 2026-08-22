/* The edit-post page (the full page on direct access/refresh); in-app
   clicks render the intercepted-route modal
   (app/(app)/@modal/(.)community/[id]/edit) — both share
   EditPostContent. */
import type { Metadata } from "next";
import EditPostContent from "./_components/EditPostContent";

export const metadata: Metadata = { title: "编辑帖子 — kimi.builders" };

export default function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditPostContent params={params} />;
}
