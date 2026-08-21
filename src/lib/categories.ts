/* 板块定义 —— 客户端/服务端共享的纯数据,不许引任何服务端依赖。 */
import type { Locale } from "./i18n";

export const CATEGORIES = [
  { id: "chat", zh: "闲聊", en: "Chat" },
  { id: "showcase", zh: "晒作品", en: "Showcase" },
  { id: "help", zh: "求助", en: "Help" },
  { id: "feedback", zh: "反馈", en: "Feedback" },
  /* 公告/News 20260820 起停用:还没有公告类内容,空分类不上架。
     恢复时取消注释即可(筛选器/发帖表单/校验全部读 CATEGORIES 自动回来);
     存量 announcement 帖的色点(PostCard CATEGORY_DOT)与文案回落不受影响。 */
  // { id: "announcement", zh: "公告", en: "News" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function categoryLabel(locale: Locale, id: string): string {
  const c = CATEGORIES.find((c) => c.id === id);
  return c ? c[locale] : id;
}
