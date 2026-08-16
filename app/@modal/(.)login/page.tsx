/* 拦截 /login:应用内点击「登录」以弹窗呈现;直接访问/刷新仍走完整页
   (app/(app)/login/page.tsx)。内容与完整页共用 LoginContent;已登录时的
   redirect(next) 在内容组件内照常生效。
   标题栏随模式变(20260919):登录/注册/找回密码/设置新密码,
   解析与主体共用 loginModeOf,口径不漂移。 */
import { getSessionUser } from "@/src/lib/auth/session";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import RouteModal from "@/app/(app)/_components/RouteModal";
import LoginContent, {
  loginModeOf,
  loginTitleKey,
} from "@/app/(app)/login/_components/LoginContent";

export default async function LoginModalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  const mode = loginModeOf(await searchParams);
  return (
    <RouteModal
      title={t(locale, loginTitleKey(mode))}
      closeLabel={t(locale, "modal.close")}
      /* 弹窗宽度贴内容(20260919):登录卡 max-w-sm + 两侧 padding ≈ 26.5rem,
         与完整页卡片同宽——模式切换留在弹窗内,不再出现宽度跳变 */
      widthCls="w-[min(94vw,26.5rem)]"
    >
      <LoginContent searchParams={searchParams} showTitle={false} />
    </RouteModal>
  );
}
