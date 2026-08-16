/* 邮件里的重置链接落点:/login/reset?token=… → /login?mode=reset&token=…
   邮件 URL 保持简短稳定;所有视图都在登录页的 mode 里。 */
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/src/lib/auth/return-to";

export default async function ResetEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const token = raw && /^[0-9a-f]{64}$/.test(raw) ? raw : "";
  /* next 透传(20260816):邮件链接从忘记密码表单带来回跳目标 */
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeReturnTo(rawNext);
  redirect(
    `/login?mode=reset${token ? `&token=${token}` : ""}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`,
  );
}
