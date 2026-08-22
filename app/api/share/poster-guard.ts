/* Poster route guard: ImageResponse is CPU-heavy rendering, so the four
   poster routes (/api/share/post|work|u|letter) share a 120/hour limit
   per source IP; over the limit the route answers 429 before any
   snapshot query or font/render pipeline. Identity uses the same
   trusted order as the usage side. */
import { consumeUsageRateLimit, requestIdentity } from "@/src/lib/usage/rate-limit";

export async function posterRateLimited(request: Request): Promise<boolean> {
  const allowed = await consumeUsageRateLimit({
    scope: "share-poster",
    identity: requestIdentity(request),
    limit: 120,
    windowSeconds: 3600,
  });
  return !allowed;
}
