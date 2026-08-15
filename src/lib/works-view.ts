/* 作品列表视图偏好(20260918):/works 与 /awesome 共用的 list(行式,默认)
   / grid(封面墙)切换。存 cookie 而非 localStorage——列表是服务端渲染,
   cookie 让服务端直接按偏好出对应卡片,无闪烁、无 hydration 跳变;
   WorksViewToggle(client)写入后 router.refresh() 换页。
   本文件客户端安全(仅常量):getWorksView(next/headers)在 works-view-server.ts,
   client 组件引本文件不会把服务端 API 打进浏览器包。
   /u/[handle] 不参与切换(固定行式)。 */
export type WorksView = "list" | "grid";
export const WORKS_VIEW_COOKIE = "kb-works-view";

/* 来源列表记忆(20260919):/works 与 /awesome 共用详情页与表单,
   「返回」按它回正确的列表;由 proxy 在列表页写、服务端读。 */
export const WORKS_SRC_COOKIE = "kb-works-src";
export type WorksSource = "works" | "awesome";
