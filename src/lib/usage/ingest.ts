import type { UsageIngestRequestV2 } from "../usage-contract";
import { getPool } from "../db";
import { projectLabelHash } from "./crypto";
import type { UsageKeyPrincipal } from "./auth";

export async function ingestUsage(
  principal: UsageKeyPrincipal,
  payload: UsageIngestRequestV2,
): Promise<{ buckets: number; sessions: number; quotaSnapshots: number }> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    if (payload.buckets.length > 0) {
      const rows = payload.buckets.map((bucket) => [
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
      const allHidden = payload.buckets.every((bucket) => bucket.project === undefined);
      const allNamed = payload.buckets.every((bucket) => bucket.project !== undefined);
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
        JSON.stringify(session.userPromptHours),
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
      buckets: payload.buckets.length,
      sessions: payload.sessions.length,
      quotaSnapshots: 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
