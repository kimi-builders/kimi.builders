/* 系统内部验证用总量(作品用量声明制,20260822_work_claims)。
   与公开社交面(social.ts)刻意解耦:不做 show_on_leaderboard opt-in 门禁。
   隐私边界取舍:作者为自己的作品声明构建投入,声明行为本身即公开授权;
   本模块的总量数字只用于 (a) 写时校验作者自己的声明额度、(b) 展示时不变式
   (同作者 Σ声明 ≤ 总量)兜底,从不直接公开渲染 —— 公开出去的只有作者自己
   写下的声明值。仅服务端调用,不进任何客户端包。 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";

type Queryable = Pool | PoolConnection;

/* 一组作者 → 各自全部时间 token 可验证总量(usage_buckets 只 SUM,无其他维度)。
   口径与 socialTokenTotalsQuery 相同,差别只在不做 opt-in JOIN(内部验证用)。
   批量一条查询,避免 N+1;空/非法 id 集 → null(调用方跳过查询)。 */
export function verifiableTokenTotalsQuery(
  userIds: (number | null)[],
): { sql: string; args: unknown[] } | null {
  const ids = [
    ...new Set(
      userIds.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0),
    ),
  ];
  if (ids.length === 0) return null;
  return {
    sql: `SELECT b.user_id,
                 SUM(b.input_tokens + b.cache_write_input_tokens + b.cache_read_input_tokens
                     + b.output_tokens + b.reasoning_output_tokens) AS total_tokens
          FROM usage_buckets b
          WHERE b.user_id IN (?)
          GROUP BY b.user_id`,
    args: [ids],
  };
}

export async function getVerifiableTokenTotals(
  userIds: (number | null)[],
  db: Queryable = getPool(),
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const q = verifiableTokenTotalsQuery(userIds);
  if (!q) return map;
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  for (const r of rows) map.set(Number(r.user_id), Number(r.total_tokens) || 0);
  return map;
}

/* 声明建议预填的项目分布:作者开了 upload_project 且有带 label 的桶时,
   按项目全部时间 tokens 降序取前若干(表单按作品名匹配,匹配不上不给建议)。
   同样仅服务端、仅作者本人视角(自己的表单自己的数据),不公开。 */
export function suggestedClaimProjectsQuery(userId: number): {
  sql: string;
  args: number[];
} {
  return {
    sql: `SELECT b.project_label AS label,
                 SUM(b.input_tokens + b.cache_write_input_tokens + b.cache_read_input_tokens
                     + b.output_tokens + b.reasoning_output_tokens) AS tokens
          FROM usage_buckets b
          JOIN usage_settings s
            ON s.user_id = b.user_id AND s.upload_project = 1
          WHERE b.user_id = ? AND b.project_label IS NOT NULL
          GROUP BY b.project_label
          ORDER BY tokens DESC
          LIMIT 50`,
    args: [userId],
  };
}

export interface ClaimProjectTotal {
  label: string;
  tokens: number;
}

export async function getSuggestedClaimProjects(
  userId: number,
  db: Queryable = getPool(),
): Promise<ClaimProjectTotal[]> {
  const q = suggestedClaimProjectsQuery(userId);
  const [rows] = await db.query<RowDataPacket[]>(q.sql, q.args);
  return rows
    .map((r) => ({ label: String(r.label ?? ""), tokens: Number(r.tokens) || 0 }))
    .filter((p) => p.label !== "" && p.tokens > 0);
}
