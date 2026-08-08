"use client";

/* 帖子作者自助操作:编辑(独立页)/ 公开⇄私密 / 删除(confirm 后软删)。
   仅作者本人渲染(服务端判断);删除成功服务端 redirect 回 feed。 */
import Link from "next/link";
import { t, type Locale } from "@/src/lib/i18n";
import {
  deletePostAction,
  setPostVisibilityAction,
} from "../actions";

export default function PostOwnerActions({
  postId,
  visibility,
  locale,
}: {
  postId: number;
  visibility: string;
  locale: Locale;
}) {
  const btn =
    "inline-flex items-center font-mono text-xs text-grey transition-colors hover:text-blue";
  return (
    <span className="inline-flex items-center gap-4">
      <Link href={`/community/${postId}/edit`} className={btn}>
        {t(locale, "post.edit")}
      </Link>
      <form action={setPostVisibilityAction} className="inline-flex">
        <input type="hidden" name="post_id" value={postId} />
        <input
          type="hidden"
          name="visibility"
          value={visibility === "private" ? "public" : "private"}
        />
        <button type="submit" className={btn}>
          {t(locale, visibility === "private" ? "post.makePublic" : "post.makePrivate")}
        </button>
      </form>
      <form
        action={deletePostAction}
        className="inline-flex"
        onSubmit={(e) => {
          if (!window.confirm(t(locale, "post.deleteConfirm"))) e.preventDefault();
        }}
      >
        <input type="hidden" name="post_id" value={postId} />
        <button type="submit" className={`${btn} hover:text-red-400`}>
          {t(locale, "post.delete")}
        </button>
      </form>
    </span>
  );
}
