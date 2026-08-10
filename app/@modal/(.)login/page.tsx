/* 拦截 /login:应用内点击「登录」以弹窗呈现;直接访问/刷新仍走完整页
   (app/(app)/login/page.tsx)。内容与完整页共用 LoginContent;已登录时的
   redirect(next) 在内容组件内照常生效。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import LoginContent from "@/app/(app)/login/_components/LoginContent";

export default async function LoginModalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  return (
    <RouteModal
      title={locale === "zh" ? "登录 kimi.builders" : "Sign in to kimi.builders"}
      closeLabel={t(locale, "modal.close")}
    >
      <LoginContent searchParams={searchParams} showTitle={false} />
    </RouteModal>
  );
}
