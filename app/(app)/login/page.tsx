/* The login/signup page (the full page on direct access/refresh);
   in-app clicks render the intercepted-route modal
   (app/(app)/@modal/(.)login) — both share LoginContent. */
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
