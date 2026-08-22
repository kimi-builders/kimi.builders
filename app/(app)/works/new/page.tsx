/* The submit-work page (the full page on direct access/refresh);
   in-app clicks render the intercepted-route modal
   (app/(app)/@modal/(.)works/new) — both share NewWorkContent.
   ?path=<slug> = the graduation source series (passed through to
   NewWorkContent). */
import type { Metadata } from "next";
import NewWorkContent from "./_components/NewWorkContent";

export const metadata: Metadata = { title: "提交作品 — kimi.builders" };

export default function NewWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string | string[] }>;
}) {
  return <NewWorkContent searchParams={searchParams} />;
}
