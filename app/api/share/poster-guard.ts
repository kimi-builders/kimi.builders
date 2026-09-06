/* Poster route guards: public posters share a source-IP bucket; the private
   usage export gets its own authenticated-user bucket so public traffic or a
   shared NAT cannot consume a member's export quota. */
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

export async function usagePosterRateLimited(userId: number): Promise<boolean> {
  const allowed = await consumeUsageRateLimit({
    scope: "usage-share-poster",
    identity: `user:${userId}`,
    limit: 120,
    windowSeconds: 3600,
  });
  return !allowed;
}
