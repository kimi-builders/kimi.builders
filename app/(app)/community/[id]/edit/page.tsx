/* 编辑帖子:仅作者(服务端校验归属,非作者 404)。
   可改标题/正文/链接;投票选项与板块不在此改(保持简单)。 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import { getLocale } from "@/src/lib/i18n-server";
import { getPost } from "@/src/lib/posts";
import { t } from "@/src/lib/i18n";
import PostEditForm from "../../_components/PostEditForm";

export const metadata: Metadata = { title: "编辑帖子 — kimi.builders" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();
  const [user, post] = await Promise.all([getSessionUser(), getPost(postId)]);
  if (!post || !user || post.userId !== user.id) notFound();
  const locale = await getLocale(user);

  return (
    <div>
      <h1 className="font-mono text-lg font-semibold">
        {t(locale, "edit.pageTitle")}
      </h1>
      <PostEditForm
        postId={post.id}
        type={post.type}
        initialTitle={post.title}
        initialBody={post.bodyMd}
        initialLinkUrl={post.linkUrl}
        locale={locale}
      />
    </div>
  );
}
