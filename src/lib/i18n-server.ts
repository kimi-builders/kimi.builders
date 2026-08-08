/* 服务端专属:解析当前请求的 UI 语言(优先级见 ./i18n 文件头)。
   拆出独立文件是因为 i18n.ts 要能被客户端组件引用,不能沾 next/headers。 */
import { cookies, headers } from "next/headers";
import { getSessionUser, type SessionUser } from "./auth/session";
import type { Locale } from "./i18n";

export async function getLocale(user?: SessionUser | null): Promise<Locale> {
  const store = await cookies();
  const c = store.get("kb_locale")?.value;
  if (c === "zh" || c === "en") return c;
  const u = user === undefined ? await getSessionUser() : user;
  if (u?.locale === "zh" || u?.locale === "en") return u.locale;
  const al = (await headers()).get("accept-language") ?? "";
  if (!al) return "zh";
  return al.toLowerCase().startsWith("zh") ? "zh" : "en";
}
