/* The new-post page (the full page on direct access/refresh); in-app
   clicks render the intercepted-route modal
   (app/(app)/@modal/(.)community/new) — both share NewPostContent. */
import NewPostContent from "./_components/NewPostContent";

export const metadata = { title: "发帖 — kimi.builders" };

export default function NewPostPage() {
  return <NewPostContent />;
}
