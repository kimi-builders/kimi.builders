import type { RowDataPacket } from "mysql2";
import { getPool } from "../db";
import { constantTimeHashEqual, usageHmac, usageKeyPrefix } from "./crypto";

export type UsageScope = "ingest" | "read" | "settings" | "delete";

export interface UsageKeyPrincipal {
  keyId: number;
  userId: number;
  deviceId: number;
  devicePublicId: string;
  scopes: ReadonlySet<string>;
}

const API_KEY_RE = /^kbu_[A-Za-z0-9_-]{43}$/;

export async function authenticateUsageRequest(
  request: Request,
  requiredScope: UsageScope,
): Promise<UsageKeyPrincipal | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const key = authorization.slice(7);
  if (!API_KEY_RE.test(key)) return null;

  const candidateHash = usageHmac(key);
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT k.id AS key_id, k.secret_hash, k.scopes,
            d.id AS device_id, d.public_id, d.user_id
     FROM usage_api_keys k
     JOIN usage_devices d ON d.id = k.device_id
     WHERE k.prefix = ?
       AND k.revoked_at IS NULL
       AND (k.expires_at IS NULL OR k.expires_at > UTC_TIMESTAMP(3))
       AND d.revoked_at IS NULL
     LIMIT 8`,
    [usageKeyPrefix(key)],
  );
  const matched = rows.find((row) => {
    const stored = Buffer.isBuffer(row.secret_hash)
      ? row.secret_hash
      : Buffer.from(row.secret_hash);
    return constantTimeHashEqual(stored, candidateHash);
  });
  if (!matched) return null;
  const scopes = new Set(String(matched.scopes).split(",").filter(Boolean));
  if (!scopes.has(requiredScope)) return null;

  await getPool().query(
    `UPDATE usage_api_keys k
     JOIN usage_devices d ON d.id = k.device_id
     SET k.last_used_at = UTC_TIMESTAMP(3), d.last_seen_at = UTC_TIMESTAMP(3)
     WHERE k.id = ?`,
    [matched.key_id],
  );
  return {
    keyId: Number(matched.key_id),
    userId: Number(matched.user_id),
    deviceId: Number(matched.device_id),
    devicePublicId: String(matched.public_id),
    scopes,
  };
}

export function usageUnauthorized(): Response {
  return Response.json(
    { ok: false, error: { code: "invalid_token", message: "Invalid or revoked usage key." } },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer realm="usage", error="invalid_token"',
      },
    },
  );
}

