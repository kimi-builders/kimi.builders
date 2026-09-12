import type { Pool, RowDataPacket } from "mysql2/promise";
import { getPool } from "../db";

export interface UsageAccountIdentity { handle: string; name: string | null }

export function publicUsageAccount(row: Record<string, unknown> | undefined): UsageAccountIdentity | null {
  if (!row || typeof row.handle !== "string" || !row.handle.trim()) return null;
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
  return { handle: clean(row.handle), name: typeof row.name === "string" ? clean(row.name) : null };
}

export async function getUsageAccountIdentity(userId: number, db: Pick<Pool, "query"> = getPool()) {
  const [rows] = await db.query<RowDataPacket[]>("SELECT handle, name FROM users WHERE id = ? LIMIT 1", [userId]);
  return publicUsageAccount(rows[0]);
}
