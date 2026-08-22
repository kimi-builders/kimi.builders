/* getWorksView:服务端读视图偏好 cookie(仅 server 组件 / server action 引用;
   next/headers 不能进 client 包,常量在客户端安全的 works-view.ts)。 */
import { cookies, headers } from "next/headers";
import {
  WORKS_SRC_COOKIE,
  WORKS_VIEW_COOKIE,
  isMobileUA,
  type WorksSource,
  type WorksView,
} from "./works-view";

/* 移动端请求判定(20260822):三页(works/awesome/explore)共用——移动端
   不渲染视图切换器,列表恒行式;与 getWorksView 同源,两次调用读同一份
   请求头(next/headers 每请求缓存)。 */
export async function isMobileRequest(): Promise<boolean> {
  const h = await headers();
  return isMobileUA(h.get("user-agent") ?? "");
}

export async function getWorksView(): Promise<WorksView> {
  /* 移动端恒行式:封面墙在手机上是单列大卡,cookie 的 grid 偏好不生效 */
  if (await isMobileRequest()) return "list";
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
