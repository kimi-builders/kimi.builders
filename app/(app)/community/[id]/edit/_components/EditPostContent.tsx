/* Edit-post body: shared by the full page (/community/[id]/edit) and
   the modal (@modal/(.)community/[id]/edit). showTitle=false collapses
   the h1 (the modal has its own title bar). Author-only (server-side
   ownership check, others 404); category/title/body/link editable,
   type and poll options are not (type determines the post's structure,
   keep it simple). */
import { notFound } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getPost } from "@/src/lib/posts";
import { t } from "@/src/lib/i18n";
import PostEditForm from "../../../_components/PostEditForm";

export default async function EditPostContent({
  params,
  showTitle = true,
}: {
  params: Promise<{ id: string }>;
  showTitle?: boolean;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();
  const [user, post] = await Promise.all([getSessionUser(), getPost(postId)]);
  if (!post || !user || post.userId !== user.id) notFound();
  const locale = await getLocale(user);

  return (
    <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
      {showTitle && (
        /* Layout alignment: the header takes eyebrow + .kb-h2, the
           section landing pages' grammar. */
        <div>
          <p className="kb-eyebrow">{t(locale, "edit.eyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "edit.pageTitle")}
          </h1>
        </div>
      )}
      <PostEditForm
        postId={post.id}
        type={post.type}
        initialCategory={post.category}
        initialTitle={post.title}
        initialBody={post.bodyMd}
        initialLinkUrl={post.linkUrl}
        locale={locale}
      />
    </div>
  );
}
