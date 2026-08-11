import { canonicalOrigin } from "@/src/lib/auth/origin";

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    /* 与站点 canonical origin 比对:生产在反代后,request.url 是内网地址 */
    return new URL(origin).origin === canonicalOrigin(request);
  } catch {
    return false;
  }
}

export function noStoreJson(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(value, { ...init, headers });
}

