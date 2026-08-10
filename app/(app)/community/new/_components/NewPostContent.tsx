/* 发帖主体:完整页(/community/new)与弹窗(@modal/(.)community/new)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏)。
   登录门槛在服务端,表单交互(PostForm)在客户端。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import PostForm from "../../_components/PostForm";

export default async function NewPostContent({
  showTitle = true,
}: {
  showTitle?: boolean;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <div>
      {showTitle && (
        <h1 className="font-mono text-lg font-semibold">
          {t(locale, "form.pageTitle")}
        </h1>
      )}
      {user ? (
        <PostForm aiDefault={user.aiRepliesEnabled} locale={locale} />
      ) : (
        <p className="mt-8 text-sm text-grey">
          {t(locale, "form.loginRequired")}
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
