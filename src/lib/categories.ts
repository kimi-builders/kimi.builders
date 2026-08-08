/* 板块定义 —— 客户端/服务端共享的纯数据,不许引任何服务端依赖。 */
import type { Locale } from "./i18n";

export const CATEGORIES = [
  { id: "chat", zh: "闲聊", en: "Chat" },
  { id: "showcase", zh: "晒作品", en: "Showcase" },
  { id: "help", zh: "求助", en: "Help" },
  { id: "feedback", zh: "反馈", en: "Feedback" },
  { id: "announcement", zh: "公告", en: "News" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function categoryLabel(locale: Locale, id: string): string {
  const c = CATEGORIES.find((c) => c.id === id);
  return c ? c[locale] : id;
}
