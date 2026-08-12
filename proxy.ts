/* Next 16 proxy(原 middleware):把当前 pathname 写进请求头 x-kb-path,
   (app) 布局壳的右栏注册表(right-rail.ts railFor)在服务端按它分发上下文。
   只覆盖 (app) 路由组的页面路径;未匹配的请求头缺失时注册表回落 community。 */
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-kb-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/community/:path*",
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
