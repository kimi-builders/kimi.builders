/* Bearer auth for cron routes. Both the presented header and the expected
   value are hashed before timingSafeEqual, so comparison time leaks neither
   a matching prefix nor the header length. A missing CRON_SECRET returns the
   same false as a wrong credential — callers answer a uniform 401, and
   outsiders cannot probe whether the key is configured. */
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}
