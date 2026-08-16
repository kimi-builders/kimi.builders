/* 登录态 chip:未登录给 GitHub / Google 入口,已登录显示头像 + @handle + 退出。
   首页(右上角)和社区壳的移动端 mini 栏共用;compact = 隐去 @handle(窄屏省宽)。
   文案跟随 UI 语言。 */
import { getSessionUser } from "@/src/lib/auth/session";
import Link from "next/link";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import Avatar from "@/components/Avatar";

export default async function AuthChip({ compact = false }: { compact?: boolean }) {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (user) {
    return (
      <>
        <Link
          href={`/u/${user.handle}`}
          title={`@${user.handle}`}
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
        >
          <Avatar
            url={user.avatarUrl}
            handle={user.handle}
            size={28}
            className="transition-opacity hover:opacity-80"
          />
        </Link>
        {!compact && (
          <Link
            href={`/u/${user.handle}`}
            className="text-paper transition-colors hover:text-blue"
          >
            @{user.handle}
          </Link>
        )}
        <a
          href="/api/auth/logout"
          className="text-grey underline underline-offset-4 transition-colors hover:text-blue"
        >
          {t(locale, "auth.logout")}
        </a>
      </>
    );
  }
  return (
    /* 单一登录入口(20260815 评审):登录方式的选择属于登录弹窗的语境,
       浏览语境里并排 GitHub/Google/邮箱只会堆高顶栏噪音;弹窗内三式齐全。
       Link 软导航 → 应用内 /login 拦截成弹窗,首页上下文同样命中。 */
    <Link
      href="/login"
      className="text-paper underline decoration-blue/60 underline-offset-4 transition-colors hover:text-blue"
    >
      {t(locale, "auth.login")}
    </Link>
  );
}
