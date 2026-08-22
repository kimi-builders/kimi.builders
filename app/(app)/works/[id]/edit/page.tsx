/* The edit-work page (the full page on direct access/refresh); in-app
   clicks render the intercepted-route modal
   (app/(app)/@modal/(.)works/[id]/edit) — both share EditWorkContent. */
import type { Metadata } from "next";
import EditWorkContent from "./_components/EditWorkContent";

export const metadata: Metadata = { title: "编辑作品 — kimi.builders" };

export default function EditWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditWorkContent params={params} />;
}
