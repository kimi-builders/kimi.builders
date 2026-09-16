/* Rate limiting for community writes (posts, comments, votes, uploads):
   DB fixed-window counters. Reuses the usage_rate_limits table (scope
   prefix community:) with the same window semantics as
   src/lib/usage/rate-limit.ts — an upsert resets an expired window,
   attempts only grow within a window, and counting precedes the verdict
   (each call consumes one unit). Identity is a peppered HMAC, never a
   plaintext userId. Difference from the usage side: community writes owe
   the user a visible wait time, so the SELECT also computes retry_after
   (seconds to window reset) and returns a structured result, not a bare
   boolean. */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { usageHmac } from "./usage/crypto";

type Queryable = Pool | PoolConnection;

export type CommunityRateAction = "post" | "comment" | "vote" | "upload" | "ai_summon" | "work" | "feedback";

export interface CommunityRateResult {
  allowed: boolean;
  /* Seconds to window reset, clamped to [1, windowSeconds]; when over the
     limit this is the user's wait time. */
  retryAfterSeconds: number;
}

/* Limits: posts 10/h, comments 30/h, votes 120/h, uploads 30/h, @kimi
   summons 20/h, work creation 10/h (same tier as posts, consumed before
   the write), reports 20/h (bulk-flagging guard). Fixed one-hour
   windows. */
export const COMMUNITY_RATE_WINDOW_SECONDS = 60 * 60;

export const COMMUNITY_RATE_LIMITS: Record<CommunityRateAction, number> = {
  post: 10,
  comment: 30,
  vote: 120,
  upload: 30,
  ai_summon: 20,
  work: 10,
  feedback: 20,
};

/* Rate-limit key: scope = community:<action>; each action counts
   independently per user. */
export function communityRateScope(action: CommunityRateAction): string {
  return `community:${action}`;
}

export function communityRateIdentityHash(
  userId: number,
  action: CommunityRateAction,
): Buffer {
  return usageHmac(`${communityRateScope(action)}\0${userId}`);
}

/* Count +1; a window_start older than windowSeconds resets the whole
   window (same upsert as the usage side). */
export function buildCommunityRateConsumeSql(): string {
  return `INSERT INTO usage_rate_limits (scope, identity_hash, window_start, attempts)
     VALUES (?, ?, UTC_TIMESTAMP(3), 1)
     ON DUPLICATE KEY UPDATE
       attempts = IF(
         window_start <= TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(3)),
         1,
         attempts + 1
       ),
       window_start = IF(
         window_start <= TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(3)),
         UTC_TIMESTAMP(3),
         window_start
       )`;
}

/* Read the count back and compute the remaining window seconds in SQL
   (the database clock is authoritative on both ends, immune to server
   clock drift). */
export function buildCommunityRateSelectSql(): string {
  return `SELECT attempts,
       TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), TIMESTAMPADD(SECOND, ?, window_start)) AS retry_after
     FROM usage_rate_limits
     WHERE scope = ? AND identity_hash = ?
     LIMIT 1`;
}

/* Count row -> structured result: over-limit attempts are rejected;
   retry_after clamps to [1, windowSeconds] (TIMESTAMPDIFF truncates to
   whole seconds, so a nearly-expired or just-expired window can compute
   0 or negative — keep at least 1 second). */
export function communityRateDecision({
  attempts,
  retryAfter,
  limit,
  windowSeconds,
}: {
  attempts: number;
  retryAfter: number;
  limit: number;
  windowSeconds: number;
}): CommunityRateResult {
  return {
    allowed: attempts <= limit,
    retryAfterSeconds: Math.min(
      windowSeconds,
      Math.max(1, Math.ceil(retryAfter)),
    ),
  };
}

/* Consume one unit and decide. The row must exist (just upserted); a
   miss is treated as over-limit — same defensive posture as the usage
   side. */
export async function consumeCommunityRateLimit(
  userId: number,
  action: CommunityRateAction,
  db: Queryable = getPool(),
): Promise<CommunityRateResult> {
  const limit = COMMUNITY_RATE_LIMITS[action];
  const windowSeconds = COMMUNITY_RATE_WINDOW_SECONDS;
  const scope = communityRateScope(action);
  const identityHash = communityRateIdentityHash(userId, action);
  await db.query(buildCommunityRateConsumeSql(), [
    scope,
    identityHash,
    windowSeconds,
    windowSeconds,
  ]);
  const [rows] = await db.query<RowDataPacket[]>(
    buildCommunityRateSelectSql(),
    [windowSeconds, scope, identityHash],
  );
  const row = rows[0];
  return communityRateDecision({
    attempts: Number(row?.attempts ?? limit + 1),
    retryAfter: Number(row?.retry_after ?? windowSeconds),
    limit,
    windowSeconds,
  });
}
