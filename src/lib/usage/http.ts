import { canonicalOrigin } from "@/src/lib/auth/origin";

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    /* Compare against the site's canonical origin: in production the app sits behind a proxy, so request.url is an internal address. */
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

