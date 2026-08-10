/* 编辑帖子主体:完整页(/community/[id]/edit)与弹窗(@modal/(.)community/[id]/edit)
   共用。showTitle=false 时收起 h1(弹窗自带标题栏)。
   仅作者(服务端校验归属,非作者 404);板块/标题/正文/链接可改,
   类型与投票选项不在此改(类型决定帖子结构,保持简单)。 */
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
    <div>
      {showTitle && (
        <h1 className="font-mono text-lg font-semibold">
          {t(locale, "edit.pageTitle")}
        </h1>
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
