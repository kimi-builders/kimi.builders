/* 发帖页:登录门槛在服务端,表单交互(PostForm)在客户端。 */
import { getSessionUser } from "@/src/lib/auth/session";
import PostForm from "../_components/PostForm";

export const metadata = { title: "发帖 — kimi.builders" };

export default async function NewPostPage() {
  const user = await getSessionUser();
  return (
    <div className="pt-8">
      <h1 className="font-mono text-lg font-semibold">发帖</h1>
      {user ? (
        <PostForm aiDefault={user.aiRepliesEnabled} />
      ) : (
        <p className="mt-8 text-sm text-grey">
          发帖需要登录:
          <a href="/api/auth/github" className="ml-2 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue">
            GitHub
          </a>
          <a href="/api/auth/google" className="ml-3 text-paper underline decoration-blue/60 underline-offset-4 hover:text-blue">
            Google
          </a>
        </p>
      )}
    </div>
  );
}
