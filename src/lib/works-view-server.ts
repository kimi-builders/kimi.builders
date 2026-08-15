/* getWorksView:服务端读视图偏好 cookie(仅 server 组件 / server action 引用;
   next/headers 不能进 client 包,常量在客户端安全的 works-view.ts)。 */
import { cookies } from "next/headers";
import { WORKS_VIEW_COOKIE, type WorksView } from "./works-view";

export async function getWorksView(): Promise<WorksView> {
  const store = await cookies();
  return store.get(WORKS_VIEW_COOKIE)?.value === "grid" ? "grid" : "list";
}
