/* getWorksView:服务端读视图偏好 cookie(仅 server 组件 / server action 引用;
   next/headers 不能进 client 包,常量在客户端安全的 works-view.ts)。 */
import { cookies } from "next/headers";
import {
  WORKS_SRC_COOKIE,
  WORKS_VIEW_COOKIE,
  type WorksSource,
  type WorksView,
} from "./works-view";

export async function getWorksView(): Promise<WorksView> {
  const store = await cookies();
  return store.get(WORKS_VIEW_COOKIE)?.value === "grid" ? "grid" : "list";
}

/* 来源列表(proxy 在 /works、/awesome 列表页写):null = 无记忆(直开详情等),
   调用方按 work.source 回落。 */
export async function getWorksSource(): Promise<WorksSource | null> {
  const store = await cookies();
  const value = store.get(WORKS_SRC_COOKIE)?.value;
  return value === "awesome" || value === "works" ? value : null;
}
