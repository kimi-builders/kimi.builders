/* 登录/注册页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)login),两者共用 LoginContent。 */
import type { Metadata } from "next";
import LoginContent from "./_components/LoginContent";

export const metadata: Metadata = { title: "登录 — kimi.builders" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LoginContent searchParams={searchParams} />;
}
