/* Community-level aggregates: site-wide token totals (home stats bar) plus an
   N-day window (monthly letter L1 facts). Cross-user queries only SUM/GROUP
   BY — no per-person dimension is exposed. Totals match the dashboard
   definition (input + cache write + cache read + output + reasoning, see
   TOKEN_TOTAL_SQL in query.ts); the window only collects rows, shaping
   (hit rate, model mix) happens in pure functions (monthly.ts). */
import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";

export async function getCommunityTokenTotal(): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens
               + output_tokens + reasoning_output_tokens) AS total
     FROM usage_buckets`,
  );
  return Number(rows[0]?.total ?? 0);
}

/* N-day window (letter L1 hit rate / model mix): five totals plus per-model
   raw rows. Canonical model merging and naming live in monthly.ts
   (topUsageModels), same definition as the dashboard. */
export interface CommunityUsageWindow {
  days: number;
  inputTokens: number;
  cacheWriteInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  models: {
    source: string;
    model: string;
    modelCanonical: string;
    modelProvider: string;
    tokens: number;
  }[];
}

export async function getCommunityUsageWindow(
  days = 30,
): Promise<CommunityUsageWindow> {
  const n = Math.max(1, Math.min(365, Math.floor(days)));
  const pool = getPool();
  const [totalRows, modelRows] = await Promise.all([
    pool
      .query<RowDataPacket[]>(
        `SELECT
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(cache_write_input_tokens), 0) AS cache_write_input_tokens,
           COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           COALESCE(SUM(reasoning_output_tokens), 0) AS reasoning_output_tokens
         FROM usage_buckets
         WHERE bucket_start > NOW() - INTERVAL ${n} DAY`,
      )
      .then(([rows]) => rows),
    /* Top 50 model groups before canonical merging; long-tail merging happens in JS. */
    pool
      .query<RowDataPacket[]>(
        `SELECT source, model, model_canonical, model_provider,
           SUM(input_tokens + cache_write_input_tokens + cache_read_input_tokens
               + output_tokens + reasoning_output_tokens) AS tokens
         FROM usage_buckets
         WHERE bucket_start > NOW() - INTERVAL ${n} DAY
         GROUP BY source, model, model_canonical, model_provider
         ORDER BY tokens DESC
         LIMIT 50`,
      )
      .then(([rows]) => rows),
  ]);
  const t = totalRows[0] ?? {};
  return {
    days: n,
    inputTokens: Number(t.input_tokens ?? 0),
    cacheWriteInputTokens: Number(t.cache_write_input_tokens ?? 0),
    cacheReadInputTokens: Number(t.cache_read_input_tokens ?? 0),
    outputTokens: Number(t.output_tokens ?? 0),
    reasoningOutputTokens: Number(t.reasoning_output_tokens ?? 0),
    models: modelRows.map((r) => ({
      source: r.source ?? "",
      model: r.model ?? "",
      modelCanonical: r.model_canonical ?? "",
      modelProvider: r.model_provider ?? "",
      tokens: Number(r.tokens ?? 0),
    })),
  };
}
