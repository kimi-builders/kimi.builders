/* Next 16 proxy(原 middleware):把当前 pathname 写进请求头 x-kb-path,
   (app) 布局壳的右栏注册表(right-rail.ts railFor)在服务端按它分发上下文。
   只覆盖 (app) 路由组的页面路径;未匹配的请求头缺失时注册表回落 community。
   另记「来源列表」cookie(20260919):/works 与 /awesome 都是作品列表,
   详情页/表单的「返回」要回用户来的那个列表——比按 work.source 猜准
   (成员作品也会出现在 /awesome)。只在列表页本体写(详情/发布/编辑不覆盖)。 */
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kb-path", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const pathname = request.nextUrl.pathname;
  const src = pathname === "/awesome" ? "awesome" : pathname === "/works" ? "works" : null;
  if (src) {
    /* 会话级 cookie(不设 maxAge):「返回」是当次浏览的导航上下文,不是长期
       偏好——30 天记忆会把从外部链接直开详情的用户送回很多天前逛过的列表 */
    response.cookies.set("kb-works-src", src, {
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/community/:path*",
    "/explore/:path*",
    "/works/:path*",
    "/awesome/:path*",
    "/blog/:path*",
    "/learn/:path*",
    "/usage/:path*",
    "/u/:path*",
    "/settings/:path*",
    "/demo-night/:path*",
    "/admin/:path*",
  ],
};
