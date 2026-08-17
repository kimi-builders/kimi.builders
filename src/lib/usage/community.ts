/* 社区级聚合:全站 token 累计(首页数据条)+ 近 N 天窗口聚合(月刊 L1 事实盘点)。
   跨用户只做 SUM/GROUP BY,不暴露任何个人维度;口径与看板总量一致
   (input + cache write + cache read + output + reasoning,见 query.ts TOKEN_TOTAL_SQL)。
   窗口聚合只做归集,命中率/模型分布的成型是纯函数(src/lib/monthly.ts)。 */
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

/* 近 N 天窗口(月刊 L1 的命中率/模型分布窗口):总量五项 + 按模型分组的原行。
   模型分布的 canonical 合并/命名在 monthly.ts(topUsageModels),与看板同口径。 */
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
    /* 模型分组取前 50 组(canonical 合并前);窗口内长尾合并在 JS 侧完成 */
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
