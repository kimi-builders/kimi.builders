/* 邮件里的重置链接落点:/login/reset?token=… → /login?mode=reset&token=…
   邮件 URL 保持简短稳定;所有视图都在登录页的 mode 里。 */
import { redirect } from "next/navigation";

export default async function ResetEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = raw && /^[0-9a-f]{64}$/.test(raw) ? raw : "";
  redirect(`/login?mode=reset${token ? `&token=${token}` : ""}`);
}
