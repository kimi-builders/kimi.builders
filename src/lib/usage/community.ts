/* 社区级聚合:全站 token 累计(首页数据条)。
   跨用户只做 SUM,不暴露任何个人维度;口径与看板总量一致
   (input + cache write + cache read + output + reasoning,见 query.ts TOKEN_TOTAL_SQL)。 */
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
