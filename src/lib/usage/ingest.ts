import type { UsageIngestRequestV2 } from "../usage-contract";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";
import { projectLabelHash } from "./crypto";
import type { UsageKeyPrincipal } from "./auth";

interface ExistingBucketRow extends RowDataPacket {
  source: string;
  model: string;
  project_hash: string;
  bucket_start: Date;
  input_tokens: number | string;
  cache_write_input_tokens: number | string;
  cache_read_input_tokens: number | string;
  output_tokens: number | string;
  reasoning_output_tokens: number | string;
}

function incomingBucketKey(
  bucket: UsageIngestRequestV2["buckets"][number],
  projectHash = projectLabelHash(bucket.project),
): string {
  return [
    bucket.source.toLowerCase(),
    bucket.model.toLowerCase(),
    projectHash.toString("hex"),
    bucket.bucketStart,
  ].join("\u0000");
}

function existingBucketKey(row: ExistingBucketRow): string {
  return [
    row.source.toLowerCase(),
    row.model.toLowerCase(),
    String(row.project_hash).toLowerCase(),
    row.bucket_start.toISOString(),
  ].join("\u0000");
}

function incomingTokenTotal(bucket: UsageIngestRequestV2["buckets"][number]): number {
  return bucket.inputTokens
    + bucket.cacheWriteInputTokens
    + bucket.cacheReadInputTokens
    + bucket.outputTokens
    + bucket.reasoningOutputTokens;
}

function existingTokenTotal(row: ExistingBucketRow): number {
  return Number(row.input_tokens)
    + Number(row.cache_write_input_tokens)
    + Number(row.cache_read_input_tokens)
    + Number(row.output_tokens)
    + Number(row.reasoning_output_tokens);
}

async function protectLargerExistingBuckets(
  connection: PoolConnection,
  principal: UsageKeyPrincipal,
  buckets: UsageIngestRequestV2["buckets"],
) {
  if (buckets.length === 0) return { accepted: [], protectedCount: 0 };
  const hashes = buckets.map((bucket) => projectLabelHash(bucket.project));
  const tuples = buckets.map(() => "(?, ?, ?, ?)").join(", ");
  const parameters = buckets.flatMap((bucket, index) => [
    bucket.source,
    bucket.model,
    hashes[index],
    new Date(bucket.bucketStart),
  ]);
  const [rows] = await connection.query<ExistingBucketRow[]>(
    `SELECT source, model, HEX(project_hash) AS project_hash, bucket_start,
            input_tokens, cache_write_input_tokens, cache_read_input_tokens,
            output_tokens, reasoning_output_tokens
       FROM usage_buckets
      WHERE user_id = ? AND device_id = ?
        AND (source, model, project_hash, bucket_start) IN (${tuples})
      FOR UPDATE`,
    [principal.userId, principal.deviceId, ...parameters],
  );
  const existingTotals = new Map(
    rows.map((row) => [existingBucketKey(row), existingTokenTotal(row)]),
  );
  const accepted = buckets.filter((bucket, index) => {
    const existing = existingTotals.get(incomingBucketKey(bucket, hashes[index]));
    return existing === undefined || existing <= incomingTokenTotal(bucket);
  });
  return { accepted, protectedCount: buckets.length - accepted.length };
}

export async function ingestUsage(
  principal: UsageKeyPrincipal,
  payload: UsageIngestRequestV2,
): Promise<{
  buckets: number;
  sessions: number;
  quotaSnapshots: number;
  protectedBuckets: number;
}> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const protectedBuckets = await protectLargerExistingBuckets(
      connection,
      principal,
      payload.buckets,
    );
    if (protectedBuckets.accepted.length > 0) {
      const rows = protectedBuckets.accepted.map((bucket) => [
        principal.userId,
        principal.deviceId,
        bucket.source,
        bucket.model,
        bucket.project ?? null,
        projectLabelHash(bucket.project),
        new Date(bucket.bucketStart),
        bucket.inputTokens,
        bucket.cacheWriteInputTokens,
        bucket.cacheReadInputTokens,
        bucket.outputTokens,
        bucket.reasoningOutputTokens,
        bucket.requestCount,
        bucket.creditUnits ?? null,
        bucket.measurement,
        payload.client.syncId,
      ]);
      await connection.query(
        `INSERT INTO usage_buckets
           (user_id, device_id, source, model, project_label, project_hash,
            bucket_start, input_tokens, cache_write_input_tokens,
            cache_read_input_tokens, output_tokens, reasoning_output_tokens,
            request_count, credit_units, measurement, sync_id)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           project_label = VALUES(project_label),
           input_tokens = VALUES(input_tokens),
           cache_write_input_tokens = VALUES(cache_write_input_tokens),
           cache_read_input_tokens = VALUES(cache_read_input_tokens),
           output_tokens = VALUES(output_tokens),
           reasoning_output_tokens = VALUES(reasoning_output_tokens),
           request_count = VALUES(request_count),
           credit_units = VALUES(credit_units),
           measurement = VALUES(measurement),
           sync_id = VALUES(sync_id)`,
        [rows],
      );
      const hiddenHash = projectLabelHash(undefined);
      const allHidden = protectedBuckets.accepted.every((bucket) => bucket.project === undefined);
      const allNamed = protectedBuckets.accepted.every((bucket) => bucket.project !== undefined);
      if (allHidden) {
        /* A privacy toggle changes the bucket natural key. Remove the former
           named variant only after its hidden replacement has landed, or the
           dashboard would double-count the same local bucket. */
        await connection.query(
          `DELETE stale FROM usage_buckets stale
           JOIN usage_buckets fresh
             ON fresh.user_id = stale.user_id
            AND fresh.device_id = stale.device_id
            AND fresh.source = stale.source
            AND fresh.model = stale.model
            AND fresh.bucket_start = stale.bucket_start
           WHERE fresh.user_id = ? AND fresh.device_id = ?
             AND fresh.sync_id = ? AND fresh.project_hash = ?
             AND stale.project_hash <> ?`,
          [
            principal.userId,
            principal.deviceId,
            payload.client.syncId,
            hiddenHash,
            hiddenHash,
          ],
        );
      } else if (allNamed) {
        await connection.query(
          `DELETE stale FROM usage_buckets stale
           JOIN usage_buckets fresh
             ON fresh.user_id = stale.user_id
            AND fresh.device_id = stale.device_id
            AND fresh.source = stale.source
            AND fresh.model = stale.model
            AND fresh.bucket_start = stale.bucket_start
           WHERE fresh.user_id = ? AND fresh.device_id = ?
             AND fresh.sync_id = ? AND fresh.project_hash <> ?
             AND stale.project_hash = ?`,
          [
            principal.userId,
            principal.deviceId,
            payload.client.syncId,
            hiddenHash,
            hiddenHash,
          ],
        );
      }
    }
    if (payload.sessions.length > 0) {
      const rows = payload.sessions.map((session) => [
        principal.userId,
        principal.deviceId,
        session.source,
        Buffer.from(session.sessionHash, "hex"),
        session.project ?? null,
        projectLabelHash(session.project),
        new Date(session.firstMessageAt),
        new Date(session.lastMessageAt),
        session.durationSeconds,
        session.activeSeconds,
        session.messageCount,
        session.userMessageCount,
        JSON.stringify(
          session.activityHours
            ? { version: 2, hours: session.activityHours }
            : session.userPromptHours,
        ),
        payload.client.syncId,
      ]);
      await connection.query(
        `INSERT INTO usage_sessions
           (user_id, device_id, source, session_hash, project_label, project_hash,
            first_message_at, last_message_at, duration_seconds, active_seconds,
            message_count, user_message_count, user_prompt_hours, sync_id)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           project_label = VALUES(project_label),
           project_hash = VALUES(project_hash),
           first_message_at = VALUES(first_message_at),
           last_message_at = VALUES(last_message_at),
           duration_seconds = VALUES(duration_seconds),
           active_seconds = VALUES(active_seconds),
           message_count = VALUES(message_count),
           user_message_count = VALUES(user_message_count),
           user_prompt_hours = VALUES(user_prompt_hours),
           sync_id = VALUES(sync_id)`,
        [rows],
      );
    }
    await connection.query(
      `UPDATE usage_devices
       SET surface = ?, client_version = ?, parser_version = ?, platform = ?,
           last_seen_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
      [
        payload.client.surface,
        payload.client.surfaceVersion,
        payload.client.parserVersion,
        payload.client.platform,
        principal.deviceId,
        principal.userId,
      ],
    );
    await connection.commit();
    return {
      buckets: protectedBuckets.accepted.length,
      sessions: payload.sessions.length,
      quotaSnapshots: 0,
      protectedBuckets: protectedBuckets.protectedCount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
