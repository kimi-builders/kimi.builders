/* 私人用量导出(Phase 2)。
   两条路径共用:CSV = 当前筛选下的聚合明细(listUsageRecords);
   JSON = 全量原始事实(不含内容、hash、内部 id、任何凭据)。
   CSV 注入防护:以 = + - @ 或制表/回车开头的单元格前置单引号。 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";
import type { UsageFilters } from "./filters";
import type { UsageRecordRow } from "./query";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export const USAGE_CSV_HEADER = [
  "date",
  "source",
  "model",
  "project",
  "device",
  "input_tokens",
  "cache_write_input_tokens",
  "cache_read_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
  "requests",
  "cost_usd_estimate",
  "price_status",
] as const;

export function recordsToCsv(records: readonly UsageRecordRow[]): string {
  const lines = [USAGE_CSV_HEADER.join(",")];
  for (const row of records) {
    lines.push(
      [
        row.day,
        row.source,
        row.model,
        row.project ?? "",
        row.deviceName,
        row.inputTokens,
        row.cacheWriteInputTokens,
        row.cacheReadInputTokens,
        row.outputTokens,
        row.reasoningOutputTokens,
        row.totalTokens,
        row.requests,
        row.priceStatus === "priced" || row.priceStatus === "partial"
          ? (row.costMicros / 1e6).toFixed(4)
          : "",
        row.priceStatus,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM 让 Excel 按 UTF-8 打开(项目名/设备名可能是中文)
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function usageCsvFilename(filters: UsageFilters): string {
  const day = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
  return `kimi-builders-usage-${day(filters.from)}-${day(filters.to)}.csv`;
}

const JSON_ROW_CAP = 100_000;

export interface UsagePrivateExport {
  format: "kimi-builders/usage-export";
  version: 1;
  exportedAt: string;
  rangeNote: string;
  settings: Record<string, unknown>;
  devices: Record<string, unknown>[];
  buckets: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  truncated: boolean;
}

/* 全量私人导出:buckets/sessions 原始事实行(按时间倒序,各封顶 10 万行)。
   不导出:内部自增 id、session_hash、project_hash、API Key、设备授权材料。 */
export async function exportUsageData(userId: number): Promise<UsagePrivateExport> {
  const pool = getPool();
  const [settingsRows, deviceRows, bucketRows, sessionRows] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT upload_project, upload_device_label, upload_quota, retention_days, updated_at
       FROM usage_settings WHERE user_id = ?`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT public_id, name, platform, surface, client_version, parser_version,
              last_seen_at, revoked_at, created_at
       FROM usage_devices WHERE user_id = ? ORDER BY created_at`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT b.bucket_start, b.source, b.model, b.project_label,
              b.input_tokens, b.cache_write_input_tokens, b.cache_read_input_tokens,
              b.output_tokens, b.reasoning_output_tokens,
              b.request_count, b.credit_units, b.measurement, b.cost_micros,
              d.name AS device_name
       FROM usage_buckets b
       JOIN usage_devices d ON d.id = b.device_id
       WHERE b.user_id = ?
       ORDER BY b.bucket_start DESC
       LIMIT ${JSON_ROW_CAP + 1}`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT s.first_message_at, s.last_message_at, s.source, s.project_label,
              s.duration_seconds, s.active_seconds, s.message_count, s.user_message_count,
              s.user_prompt_hours, d.name AS device_name
       FROM usage_sessions s
       JOIN usage_devices d ON d.id = s.device_id
       WHERE s.user_id = ?
       ORDER BY s.first_message_at DESC
       LIMIT ${JSON_ROW_CAP + 1}`,
      [userId],
    ),
  ]);
  const buckets = bucketRows[0];
  const sessions = sessionRows[0];
  const truncated = buckets.length > JSON_ROW_CAP || sessions.length > JSON_ROW_CAP;
  return {
    format: "kimi-builders/usage-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    rangeNote:
      "Self-reported metrics from your own devices. No conversation content, paths, or credentials are ever uploaded.",
    settings: (settingsRows[0][0] as Record<string, unknown> | undefined) ?? {},
    devices: deviceRows[0].map((row) => ({ ...row })),
    buckets: buckets.slice(0, JSON_ROW_CAP).map((row) => ({ ...row })),
    sessions: sessions.slice(0, JSON_ROW_CAP).map((row) => ({ ...row })),
    truncated,
  };
}
