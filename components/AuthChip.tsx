/* 登录态 chip:未登录给 GitHub / Google 入口,已登录显示头像 + @handle + 退出。
   首页(右上角)和 SiteHeader 共用。 */
import { getSessionUser } from "@/src/lib/auth/session";

export default async function AuthChip() {
  const user = await getSessionUser();
  if (user) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatarUrl}
          alt=""
          className="h-7 w-7 rounded-full border border-paper/20"
        />
        <span className="text-paper">@{user.handle}</span>
        <a
          href="/api/auth/logout"
          className="text-grey underline underline-offset-4 transition-colors hover:text-blue"
        >
          退出
        </a>
      </>
    );
  }
  return (
    <>
      <span className="text-grey">登录</span>
      <a
        href="/api/auth/github"
        className="text-paper underline decoration-blue/60 underline-offset-4 transition-colors hover:text-blue"
      >
        GitHub
      </a>
      <a
        href="/api/auth/google"
        className="text-paper underline decoration-blue/60 underline-offset-4 transition-colors hover:text-blue"
      >
        Google
      </a>
    </>
  );
}
