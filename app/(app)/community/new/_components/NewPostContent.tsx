/* 发帖主体:完整页(/community/new)与弹窗(@modal/(.)community/new)共用。
   showTitle=false 时收起 h1(弹窗自带标题栏)。
   登录门槛在服务端,表单交互(PostForm)在客户端;
   未登录 = 统一登录引导卡(20260919,与全站登录门同一张脸)。 */
import { getSessionUser } from "@/src/lib/auth/session";
import LoginGate from "@/app/(app)/_components/LoginGate";
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
    <div className={showTitle ? "rounded-2xl border border-line bg-card p-4 sm:p-6" : ""}>
      {showTitle && (
        <h1 className="text-2xl font-semibold text-paper">
          {t(locale, "form.pageTitle")}
        </h1>
      )}
      {user ? (
        <PostForm aiDefault={user.aiRepliesEnabled} locale={locale} />
      ) : (
        <div className={showTitle ? "mt-6" : ""}>
          <LoginGate
            locale={locale}
            title={t(locale, "gate.post")}
            next="/community/new"
          />
        </div>
      )}
    </div>
  );
}
