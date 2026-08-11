/* 社区写操作限流(P1-5):发帖 / 评论 / 顶踩投票 / 图片上传的 DB 固定窗口计数器。
   复用 usage_rate_limits 表(scope 前缀 community: 区分),窗口与计数语义同
   src/lib/usage/rate-limit.ts —— upsert 时窗口过期即重置,窗口内 attempts 只增,
   计数先于判定(本次调用即占一个额度)。identity 同 usage 侧存 peppered HMAC,
   不落明文 userId。
   与 usage 侧的差别:社区写操作要给用户可见的等待时长,所以 SELECT 一并算
   retry_after(窗口剩余秒数),返回结构化结果而非纯布尔。 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "./db";
import { usageHmac } from "./usage/crypto";

type Queryable = Pool | PoolConnection;

export type CommunityRateAction = "post" | "comment" | "vote" | "upload";

export interface CommunityRateResult {
  allowed: boolean;
  /* 距窗口重置的秒数,夹在 [1, windowSeconds];超限时即用户需等待的时长 */
  retryAfterSeconds: number;
}

/* 限额(P1-5):发帖 10/小时、评论 30/小时、顶踩投票 120/小时、上传 30/小时;固定窗口 1 小时 */
export const COMMUNITY_RATE_WINDOW_SECONDS = 60 * 60;

export const COMMUNITY_RATE_LIMITS: Record<CommunityRateAction, number> = {
  post: 10,
  comment: 30,
  vote: 120,
  upload: 30,
};

/* 限流键:scope = community:<action>,同一用户不同 action 各自独立计数 */
export function communityRateScope(action: CommunityRateAction): string {
  return `community:${action}`;
}

export function communityRateIdentityHash(
  userId: number,
  action: CommunityRateAction,
): Buffer {
  return usageHmac(`${communityRateScope(action)}\0${userId}`);
}

/* 计数 +1;窗口_start 早于 windowSeconds 前则整窗重置(与 usage 侧同一段 upsert) */
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

/* 读回计数,并在库内算窗口剩余秒数(两端时钟以库为准,避免服务器时钟漂移) */
export function buildCommunityRateSelectSql(): string {
  return `SELECT attempts,
       TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), TIMESTAMPADD(SECOND, ?, window_start)) AS retry_after
     FROM usage_rate_limits
     WHERE scope = ? AND identity_hash = ?
     LIMIT 1`;
}

/* 计数行 → 结构化结果:attempts 超限即拒;retry_after 夹到 [1, windowSeconds]
   (TIMESTAMPDIFF 整秒截断,窗口将尽/刚过期时可能算出 0 或负值,至少留 1 秒) */
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

/* 消耗一次额度并判定。行必然存在(刚 upsert 过);查不到按超限拒,
   与 usage 侧同一防御姿态。 */
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
