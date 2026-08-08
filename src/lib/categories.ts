/* 板块定义 —— 客户端/服务端共享的纯数据,不许引任何服务端依赖。 */
export const CATEGORIES = [
  { id: "chat", zh: "闲聊" },
  { id: "showcase", zh: "晒作品" },
  { id: "help", zh: "求助" },
  { id: "feedback", zh: "反馈" },
  { id: "announcement", zh: "公告" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function categoryZh(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.zh ?? id;
}
