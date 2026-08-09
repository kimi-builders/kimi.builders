import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "../db";
import {
  createDeviceCode,
  createDevicePublicId,
  createUsageApiKey,
  createUserCode,
  normalizeUserCode,
  usageHmac,
  usageKeyPrefix,
} from "./crypto";
import type { UsageSettings } from "./settings";
import { updateUsageSettings } from "./settings";
import { parseUsageAgentVersions, usageDeviceDisplayName } from "./device-label";

const DEVICE_CODE_TTL_SECONDS = 10 * 60;
const DEVICE_POLL_INTERVAL_SECONDS = 5;
const VALID_PLATFORMS = new Set(["darwin", "linux", "win32", "unknown"]);
const VALID_SURFACES = new Set(["cli", "daemon", "mac-app", "windows-app"]);

function cleanLabel(value: unknown, fallback: string, maxLength = 80): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
  return cleaned || fallback;
}

function cleanEnum(value: unknown, allowed: ReadonlySet<string>, fallback: string): string {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

export interface DeviceAuthorizationRequest {
  clientName: string;
  deviceName: string;
  platform: string;
  surface: string;
}

export interface DeviceAuthorizationPreview {
  clientName: string;
  deviceName: string;
  platform: string;
  surface: string;
  status: string;
  expiresAt: Date;
}

export async function createDeviceAuthorization(input: Record<string, unknown>): Promise<{
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  interval: number;
}> {
  const platform = cleanEnum(input.platform, VALID_PLATFORMS, "unknown");
  const surface = cleanEnum(input.surface, VALID_SURFACES, "cli");
  const request: DeviceAuthorizationRequest = {
    clientName: cleanLabel(input.clientName, "Kimi Builders Usage"),
    deviceName: cleanLabel(input.deviceName, usageDeviceDisplayName({ platform, surface })),
    platform,
    surface,
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const deviceCode = createDeviceCode();
    const userCode = createUserCode();
    try {
      await getPool().query(
        `INSERT INTO usage_device_codes
           (device_code_hash, user_code_hash, client_name, requested_device_name,
            platform, surface, interval_seconds, next_poll_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3),
                 TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))`,
        [
          usageHmac(deviceCode),
          usageHmac(userCode),
          request.clientName,
          request.deviceName,
          request.platform,
          request.surface,
          DEVICE_POLL_INTERVAL_SECONDS,
          DEVICE_CODE_TTL_SECONDS,
        ],
      );
      return {
        deviceCode,
        userCode,
        expiresIn: DEVICE_CODE_TTL_SECONDS,
        interval: DEVICE_POLL_INTERVAL_SECONDS,
      };
    } catch (error) {
      const duplicate =
        !!error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY";
      if (!duplicate || attempt === 4) throw error;
    }
  }
  throw new Error("Unable to allocate a device code");
}

export async function getDeviceAuthorizationPreview(
  rawUserCode: string,
): Promise<DeviceAuthorizationPreview | null> {
  const userCode = normalizeUserCode(rawUserCode);
  if (!userCode) return null;
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT client_name, requested_device_name, platform, surface, status, expires_at
     FROM usage_device_codes
     WHERE user_code_hash = ?
     LIMIT 1`,
    [usageHmac(userCode)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    clientName: String(row.client_name),
    deviceName: String(row.requested_device_name),
    platform: String(row.platform),
    surface: String(row.surface),
    status: String(row.status),
    expiresAt: row.expires_at as Date,
  };
}

export async function decideDeviceAuthorization({
  userId,
  userCode: rawUserCode,
  action,
  deviceName,
  settings,
}: {
  userId: number;
  userCode: string;
  action: "approve" | "deny";
  deviceName?: string;
  settings?: UsageSettings;
}): Promise<"approved" | "denied" | "expired" | "not_found" | "unavailable"> {
  const userCode = normalizeUserCode(rawUserCode);
  if (!userCode) return "not_found";
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, status, expires_at, approved_user_id, requested_device_name
       FROM usage_device_codes
       WHERE user_code_hash = ?
       LIMIT 1 FOR UPDATE`,
      [usageHmac(userCode)],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return "not_found";
    }
    if ((row.expires_at as Date).getTime() <= Date.now()) {
      await connection.query(
        "UPDATE usage_device_codes SET status = 'expired' WHERE id = ?",
        [row.id],
      );
      await connection.commit();
      return "expired";
    }
    if (row.status !== "pending") {
      const sameApproval = row.status === "approved" && Number(row.approved_user_id) === userId;
      await connection.rollback();
      return sameApproval ? "approved" : "unavailable";
    }

    if (action === "deny") {
      await connection.query(
        `UPDATE usage_device_codes
         SET status = 'denied', denied_at = UTC_TIMESTAMP(3), approved_user_id = ?
         WHERE id = ?`,
        [userId, row.id],
      );
      await connection.commit();
      return "denied";
    }

    const approvedName = cleanLabel(deviceName, String(row.requested_device_name));
    await connection.query(
      `UPDATE usage_device_codes
       SET status = 'approved', approved_user_id = ?, approved_device_name = ?,
           approved_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [userId, approvedName, row.id],
    );
    if (settings) await updateUsageSettings(userId, settings, connection);
    await connection.commit();
    return "approved";
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type DeviceTokenResult =
  | { status: "authorization_pending"; interval: number }
  | { status: "slow_down"; interval: number }
  | { status: "access_denied" }
  | { status: "expired_token" }
  | { status: "invalid_grant" }
  | { status: "approved"; apiKey: string; deviceId: string };

export async function exchangeDeviceCode(rawDeviceCode: string): Promise<DeviceTokenResult> {
  if (!/^kbd_[A-Za-z0-9_-]{43}$/.test(rawDeviceCode)) {
    return { status: "invalid_grant" };
  }
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM usage_device_codes
       WHERE device_code_hash = ?
       LIMIT 1 FOR UPDATE`,
      [usageHmac(rawDeviceCode)],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return { status: "invalid_grant" };
    }
    const now = Date.now();
    if ((row.expires_at as Date).getTime() <= now || row.status === "expired") {
      await connection.query(
        "UPDATE usage_device_codes SET status = 'expired' WHERE id = ?",
        [row.id],
      );
      await connection.commit();
      return { status: "expired_token" };
    }
    if (row.status === "denied") {
      await connection.rollback();
      return { status: "access_denied" };
    }
    if (row.status === "delivered") {
      await connection.rollback();
      return { status: "expired_token" };
    }
    const interval = Number(row.interval_seconds);
    if (row.status === "pending") {
      if ((row.next_poll_at as Date).getTime() > now) {
        await connection.rollback();
        return { status: "slow_down", interval };
      }
      await connection.query(
        `UPDATE usage_device_codes
         SET next_poll_at = TIMESTAMPADD(SECOND, interval_seconds, UTC_TIMESTAMP(3))
         WHERE id = ?`,
        [row.id],
      );
      await connection.commit();
      return { status: "authorization_pending", interval };
    }
    if (row.status !== "approved" || !row.approved_user_id) {
      await connection.rollback();
      return { status: "invalid_grant" };
    }

    const apiKey = createUsageApiKey();
    const publicId = createDevicePublicId();
    const [deviceResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO usage_devices
         (user_id, public_id, name, platform, surface)
       VALUES (?, ?, ?, ?, ?)`,
      [
        row.approved_user_id,
        publicId,
        cleanLabel(row.approved_device_name, String(row.requested_device_name)),
        cleanEnum(row.platform, VALID_PLATFORMS, "unknown"),
        cleanEnum(row.surface, VALID_SURFACES, "cli"),
      ],
    );
    await connection.query(
      `INSERT INTO usage_api_keys (device_id, prefix, secret_hash)
       VALUES (?, ?, ?)`,
      [deviceResult.insertId, usageKeyPrefix(apiKey), usageHmac(apiKey)],
    );
    await connection.query(
      `UPDATE usage_device_codes
       SET status = 'delivered', delivered_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [row.id],
    );
    await connection.commit();
    return { status: "approved", apiKey, deviceId: publicId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export interface UsageDeviceSummary {
  id: string;
  name: string;
  platform: string;
  surface: string;
  clientVersion: string;
  parserVersion: string;
  terminalName: string;
  terminalVersion: string;
  osName: string;
  osVersion: string;
  architecture: string;
  agentVersions: Record<string, string>;
  bucketCount: number;
  sessionCount: number;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listUsageDevices(userId: number): Promise<UsageDeviceSummary[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT public_id, name, platform, surface, client_version, parser_version,
            terminal_name, terminal_version, os_name, os_version, architecture,
            agent_versions,
            (SELECT COUNT(*) FROM usage_buckets b
              WHERE b.user_id = d.user_id AND b.device_id = d.id) AS bucket_count,
            (SELECT COUNT(*) FROM usage_sessions s
              WHERE s.user_id = d.user_id AND s.device_id = d.id) AS session_count,
            last_seen_at, revoked_at, created_at
     FROM usage_devices d
     WHERE d.user_id = ?
     ORDER BY revoked_at IS NULL DESC, COALESCE(last_seen_at, created_at) DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.public_id),
    name: usageDeviceDisplayName({
      name: row.name,
      platform: row.platform,
      surface: row.surface,
      clientVersion: row.client_version,
      terminalName: row.terminal_name,
      terminalVersion: row.terminal_version,
      osName: row.os_name,
      osVersion: row.os_version,
      architecture: row.architecture,
    }),
    platform: String(row.platform),
    surface: String(row.surface),
    clientVersion: row.client_version === null ? "" : String(row.client_version),
    parserVersion: row.parser_version === null ? "" : String(row.parser_version),
    terminalName: row.terminal_name === null ? "" : String(row.terminal_name),
    terminalVersion: row.terminal_version === null ? "" : String(row.terminal_version),
    osName: row.os_name === null ? "" : String(row.os_name),
    osVersion: row.os_version === null ? "" : String(row.os_version),
    architecture: row.architecture === null ? "" : String(row.architecture),
    agentVersions: parseUsageAgentVersions(row.agent_versions),
    bucketCount: Number(row.bucket_count) || 0,
    sessionCount: Number(row.session_count) || 0,
    lastSeenAt: (row.last_seen_at as Date | null) ?? null,
    revokedAt: (row.revoked_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  }));
}

export async function revokeUsageDevice(
  userId: number,
  publicId: string,
  deleteData: boolean,
): Promise<boolean> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM usage_devices WHERE user_id = ? AND public_id = ? LIMIT 1 FOR UPDATE",
      [userId, publicId],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return false;
    }
    await connection.query(
      "UPDATE usage_devices SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3)) WHERE id = ?",
      [row.id],
    );
    await connection.query(
      "UPDATE usage_api_keys SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3)) WHERE device_id = ?",
      [row.id],
    );
    if (deleteData) {
      await connection.query("DELETE FROM usage_sessions WHERE user_id = ? AND device_id = ?", [
        userId,
        row.id,
      ]);
      await connection.query("DELETE FROM usage_buckets WHERE user_id = ? AND device_id = ?", [
        userId,
        row.id,
      ]);
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteUsageForDeviceByPublicId(
  userId: number,
  publicId: string,
): Promise<number | null> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM usage_devices WHERE user_id = ? AND public_id = ? LIMIT 1 FOR UPDATE",
      [userId, publicId],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return null;
    }
    const [sessions] = await connection.query<ResultSetHeader>(
      "DELETE FROM usage_sessions WHERE user_id = ? AND device_id = ?",
      [userId, row.id],
    );
    const [buckets] = await connection.query<ResultSetHeader>(
      "DELETE FROM usage_buckets WHERE user_id = ? AND device_id = ?",
      [userId, row.id],
    );
    await connection.commit();
    return sessions.affectedRows + buckets.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteUsageForDevice(userId: number, deviceId: number): Promise<number> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [sessions] = await connection.query<ResultSetHeader>(
      "DELETE FROM usage_sessions WHERE user_id = ? AND device_id = ?",
      [userId, deviceId],
    );
    const [buckets] = await connection.query<ResultSetHeader>(
      "DELETE FROM usage_buckets WHERE user_id = ? AND device_id = ?",
      [userId, deviceId],
    );
    await connection.commit();
    return sessions.affectedRows + buckets.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteAllUsage(userId: number): Promise<number> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [sessions] = await connection.query<ResultSetHeader>(
      "DELETE FROM usage_sessions WHERE user_id = ?",
      [userId],
    );
    const [buckets] = await connection.query<ResultSetHeader>(
      "DELETE FROM usage_buckets WHERE user_id = ?",
      [userId],
    );
    const [legacy] = await connection.query<ResultSetHeader>(
      "DELETE FROM usage_daily WHERE user_id = ?",
      [userId],
    );
    await connection.commit();
    return sessions.affectedRows + buckets.affectedRows + legacy.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
