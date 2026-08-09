import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";
import { USAGE_PRIVACY_DEFAULTS } from "../usage-contract";

type Queryable = Pool | PoolConnection;

export interface UsageSettings {
  uploadProject: boolean;
  uploadDeviceLabel: boolean;
  uploadQuotaSnapshots: boolean;
  /* P1-1:自愿公开聚合用量(社区榜/热力图/作品徽章共用);默认 false(deny)。 */
  showOnLeaderboard: boolean;
  retentionDays: number;
}

export async function getUsageSettings(
  userId: number,
  db: Queryable = getPool(),
): Promise<UsageSettings> {
  await db.query("INSERT IGNORE INTO usage_settings (user_id) VALUES (?)", [userId]);
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT upload_project, upload_device_label, upload_quota, show_on_leaderboard, retention_days
     FROM usage_settings WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return { ...USAGE_PRIVACY_DEFAULTS };
  return {
    uploadProject: !!row.upload_project,
    uploadDeviceLabel: !!row.upload_device_label,
    uploadQuotaSnapshots: !!row.upload_quota,
    showOnLeaderboard: !!row.show_on_leaderboard,
    retentionDays: Number(row.retention_days),
  };
}

export async function updateUsageSettings(
  userId: number,
  settings: UsageSettings,
  db: Queryable = getPool(),
): Promise<void> {
  await db.query(
    `INSERT INTO usage_settings
       (user_id, upload_project, upload_device_label, upload_quota, show_on_leaderboard, retention_days)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       upload_project = VALUES(upload_project),
       upload_device_label = VALUES(upload_device_label),
       upload_quota = VALUES(upload_quota),
       show_on_leaderboard = VALUES(show_on_leaderboard),
       retention_days = VALUES(retention_days)`,
    [
      userId,
      settings.uploadProject ? 1 : 0,
      settings.uploadDeviceLabel ? 1 : 0,
      settings.uploadQuotaSnapshots ? 1 : 0,
      settings.showOnLeaderboard ? 1 : 0,
      settings.retentionDays,
    ],
  );
}

export function parseUsageSettings(value: unknown): UsageSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const retentionDays = Number(record.retentionDays ?? USAGE_PRIVACY_DEFAULTS.retentionDays);
  if (![30, 90, 180, 365, 730].includes(retentionDays)) return null;
  const boolean = (key: string, fallback: boolean): boolean | null => {
    if (!(key in record)) return fallback;
    return typeof record[key] === "boolean" ? (record[key] as boolean) : null;
  };
  const uploadProject = boolean("uploadProject", false);
  const uploadDeviceLabel = boolean("uploadDeviceLabel", false);
  const uploadQuotaSnapshots = boolean("uploadQuotaSnapshots", false);
  const showOnLeaderboard = boolean("showOnLeaderboard", false);
  if (
    uploadProject === null ||
    uploadDeviceLabel === null ||
    uploadQuotaSnapshots === null ||
    showOnLeaderboard === null
  ) {
    return null;
  }
  return {
    uploadProject,
    uploadDeviceLabel,
    uploadQuotaSnapshots,
    showOnLeaderboard,
    retentionDays,
  };
}

