/* System-internal verifiable token totals (work claims). Deliberately
   decoupled from the public social surface (social.ts): no
   show_on_leaderboard opt-in gate here. Privacy boundary: an author
   claiming build effort for their own work is itself a public act; these
   totals only back (a) the author's own claim allowance at write time and
   (b) the display invariant (per-author sum of claims <= totals) — the
   published number is always the author's own claim, never this module's
   raw total. Server-side only; never imported into client bundles. */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";

type Queryable = Pool | PoolConnection;

/* Per-author all-time verifiable totals for a set of ids (pure SUM over
   usage_buckets, no other dimension). Same definition as
   socialTokenTotalsQuery minus the opt-in JOIN (internal verification).
   One batched query avoids N+1; empty/invalid id sets return null and the
   caller skips the query. */
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

/* Project mix suggested as claim prefill: when the author enabled
   upload_project and has labeled buckets, take the top projects by all-time
   tokens (the form matches by work name; no suggestion when nothing
   matches). Also server-side, author-eyes-only; never public. */
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
