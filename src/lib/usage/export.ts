/* Private usage export (Phase 2). Two paths share this module: CSV =
   aggregated detail under the current filters (listUsageRecords); JSON =
   full raw facts (no content, hashes, internal ids, or credentials).
   CSV injection guard: cells starting with = + - @ or tab/CR get a leading
   single quote. */
import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";
import type { UsageFilters } from "./filters";
import { USAGE_JSON_EXPORT_ROW_CAP } from "./filters";
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
  "model_canonical",
  "model_provider",
  "reasoning_effort",
  "agent_version",
  "context_tier",
  "processing_tier",
  "project",
  "device",
  "device_detail",
  "input_tokens",
  "cache_write_input_tokens",
  "cache_write_5m_input_tokens",
  "cache_write_1h_input_tokens",
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
        row.modelCanonical,
        row.modelProvider,
        row.reasoningEffort,
        row.agentVersion,
        row.contextTier,
        row.processingTier,
        row.project ?? "",
        row.deviceName,
        row.deviceDetail,
        row.inputTokens,
        row.cacheWriteInputTokens,
        row.cacheWrite5mInputTokens ?? 0,
        row.cacheWrite1hInputTokens ?? 0,
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
  // BOM so Excel opens it as UTF-8 (project/device names may be Chinese)
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function usageCsvFilename(filters: UsageFilters): string {
  const day = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
  return `kimi-builders-usage-${day(filters.from)}-${day(filters.to)}.csv`;
}

export function capUsageExportRows<T>(
  records: readonly T[],
  limit: number,
): { rows: T[]; truncated: boolean } {
  const safeLimit = Math.max(0, Math.trunc(limit));
  return {
    rows: records.slice(0, safeLimit),
    truncated: records.length > safeLimit,
  };
}

export interface UsagePrivateExport {
  format: "kimi-builders/usage-export";
  version: 3;
  exportedAt: string;
  rangeNote: string;
  limits: { buckets: number; sessions: number };
  counts: {
    buckets: { total: number; exported: number };
    sessions: { total: number; exported: number };
  };
  settings: Record<string, unknown>;
  devices: Record<string, unknown>[];
  buckets: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  truncated: boolean;
}

/* Full private export: raw buckets/sessions rows (newest first, capped at
   100k rows each). Never exports internal auto-increment ids, session_hash,
   project_hash, API keys, or device authorization material. */
export async function exportUsageData(userId: number): Promise<UsagePrivateExport> {
  const pool = getPool();
  const [
    settingsRows,
    deviceRows,
    bucketRows,
    sessionRows,
    bucketCountRows,
    sessionCountRows,
  ] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT upload_project, upload_device_label, upload_quota, retention_days, updated_at
       FROM usage_settings WHERE user_id = ?`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT public_id, name, platform, surface, client_version, parser_version,
              terminal_name, terminal_version, terminal_confidence,
              os_name, os_version, architecture,
              agent_versions,
              last_seen_at, revoked_at, created_at
       FROM usage_devices WHERE user_id = ? ORDER BY created_at`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT b.bucket_start, b.source, b.model, b.model_canonical, b.model_provider,
              b.reasoning_effort, b.agent_version, b.project_label,
              b.context_tier, b.processing_tier,
              b.input_tokens, b.cache_write_input_tokens,
              b.cache_write_5m_input_tokens, b.cache_write_1h_input_tokens,
              b.cache_read_input_tokens,
              b.output_tokens, b.reasoning_output_tokens,
              b.request_count, b.credit_units, b.measurement, b.cost_micros,
              d.name AS device_name
       FROM usage_buckets b
       JOIN usage_devices d ON d.id = b.device_id
       WHERE b.user_id = ?
       ORDER BY b.bucket_start DESC
       LIMIT ${USAGE_JSON_EXPORT_ROW_CAP}`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT s.first_message_at, s.last_message_at, s.source, s.agent_version,
              s.project_label,
              s.duration_seconds, s.active_seconds, s.message_count, s.user_message_count,
              s.user_prompt_hours, d.name AS device_name
       FROM usage_sessions s
       JOIN usage_devices d ON d.id = s.device_id
       WHERE s.user_id = ?
       ORDER BY s.first_message_at DESC
       LIMIT ${USAGE_JSON_EXPORT_ROW_CAP}`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM usage_buckets WHERE user_id = ?",
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM usage_sessions WHERE user_id = ?",
      [userId],
    ),
  ]);
  const buckets = bucketRows[0];
  const sessions = sessionRows[0];
  const bucketTotal = Number(bucketCountRows[0][0]?.count) || 0;
  const sessionTotal = Number(sessionCountRows[0][0]?.count) || 0;
  const truncated =
    bucketTotal > USAGE_JSON_EXPORT_ROW_CAP || sessionTotal > USAGE_JSON_EXPORT_ROW_CAP;
  return {
    format: "kimi-builders/usage-export",
    version: 3,
    exportedAt: new Date().toISOString(),
    rangeNote:
      "Self-reported metrics from your own devices. No conversation content, paths, or credentials are ever uploaded.",
    limits: {
      buckets: USAGE_JSON_EXPORT_ROW_CAP,
      sessions: USAGE_JSON_EXPORT_ROW_CAP,
    },
    counts: {
      buckets: { total: bucketTotal, exported: buckets.length },
      sessions: { total: sessionTotal, exported: sessions.length },
    },
    settings: (settingsRows[0][0] as Record<string, unknown> | undefined) ?? {},
    devices: deviceRows[0].map((row) => ({ ...row })),
    buckets: buckets.map((row) => ({ ...row })),
    sessions: sessions.map((row) => ({ ...row })),
    truncated,
  };
}
