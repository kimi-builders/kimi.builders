/* 用量同步端点:POST /api/usage/sync
   鉴权:共享密钥 USAGE_SYNC_SECRET(站点环境变量)+ body 里的 handle 定用户。
   脚本只上传按天汇总的数字;secret 未配置时 503(功能未启用)。 */
import { NextResponse } from "next/server";
import { upsertUsageDays, type UsageDayInput } from "@/src/lib/usage";
import { getPool } from "@/src/lib/db";
import type { RowDataPacket } from "mysql2";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 62; // 一次最多同步约两个月
const MAX_NUM = 1e15;

function num(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_NUM) return null;
  return Math.floor(n);
}

export async function POST(req: Request) {
  const secret = process.env.USAGE_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "sync not configured" },
      { status: 503 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (body.secret !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const handle = String(body.handle ?? "").toLowerCase();
  if (!handle) {
    return NextResponse.json({ ok: false, error: "handle required" }, { status: 400 });
  }
  const rawDays = Array.isArray(body.days) ? body.days : [];
  if (rawDays.length === 0 || rawDays.length > MAX_DAYS) {
    return NextResponse.json(
      { ok: false, error: `days must be 1..${MAX_DAYS}` },
      { status: 400 },
    );
  }
  const days: UsageDayInput[] = [];
  for (const raw of rawDays) {
    const d = raw as Record<string, unknown>;
    const day = String(d.day ?? "");
    if (!DAY_RE.test(day)) {
      return NextResponse.json({ ok: false, error: "bad day format" }, { status: 400 });
    }
    const fields = {
      tokensIn: num(d.tokensIn),
      tokensOut: num(d.tokensOut),
      tokensCached: num(d.tokensCached),
      costMicros: num(d.costMicros ?? 0),
      activeSeconds: num(d.activeSeconds),
      sessions: num(d.sessions),
      messages: num(d.messages),
    };
    if (Object.values(fields).some((v) => v === null)) {
      return NextResponse.json({ ok: false, error: "bad numbers" }, { status: 400 });
    }
    days.push({ day, ...(fields as Omit<UsageDayInput, "day">) });
  }

  const [users] = await getPool().query<RowDataPacket[]>(
    "SELECT id FROM users WHERE handle = ? LIMIT 1",
    [handle],
  );
  if (!users[0]) {
    return NextResponse.json({ ok: false, error: "unknown handle" }, { status: 404 });
  }
  await upsertUsageDays(Number(users[0].id), days);
  return NextResponse.json({ ok: true, days: days.length });
}
