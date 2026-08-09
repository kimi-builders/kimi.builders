import { getSessionUser } from "@/src/lib/auth/session";
import { authenticateUsageRequest, usageUnauthorized } from "@/src/lib/usage/auth";
import {
  capUsageExportRows,
  exportUsageData,
  recordsToCsv,
  usageCsvFilename,
} from "@/src/lib/usage/export";
import {
  parseUsageFilters,
  USAGE_EXPORT_MAX_ROWS,
  USAGE_JSON_EXPORT_ROW_CAP,
} from "@/src/lib/usage/filters";
import { noStoreJson } from "@/src/lib/usage/http";
import { captureUsageOperation } from "@/src/lib/usage/observability";
import { listUsageRecords } from "@/src/lib/usage/query";
import { getUsageSettings } from "@/src/lib/usage/settings";

/* GET /api/usage/export — 私人数据导出。
   format=csv  : 当前筛选条件下的聚合明细(与看板明细同口径),封顶 2 万行。
   format=json : 全量原始事实(buckets/sessions 各封顶 10 万行)。
   两者都不含内部 id、session/project hash、API Key 或任何凭据。
   鉴权:站点会话,或 Bearer kbu_ Key(read scope)。no-store。 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  const principal = user ? null : await authenticateUsageRequest(request, "read");
  const userId = user?.id ?? principal?.userId;
  if (!userId) return usageUnauthorized();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  if (format === "json") {
    const exported = await captureUsageOperation(
      "usage.export.json",
      () => exportUsageData(userId),
      {
        slowMs: 2_500,
        summarize: (value) => ({
          buckets: value.counts.buckets.exported,
          sessions: value.counts.sessions.exported,
          truncated: value.truncated,
        }),
      },
    );
    if (!exported.ok) {
      return noStoreJson(
        { ok: false, error: "export_failed", reference: exported.reference },
        { status: 500 },
      );
    }
    const data = exported.value;
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="kimi-builders-usage-export-${day}.json"`,
        "Cache-Control": "no-store",
        "X-Usage-Export-Truncated": String(data.truncated),
        "X-Usage-Export-Row-Limit": String(USAGE_JSON_EXPORT_ROW_CAP),
        "X-Usage-Export-Buckets": String(data.counts.buckets.exported),
        "X-Usage-Export-Sessions": String(data.counts.sessions.exported),
        "Server-Timing": `usage-export;dur=${exported.durationMs}`,
      },
    });
  }

  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const settings = await getUsageSettings(userId);
  const filters = parseUsageFilters(raw, {
    uploadProject: settings.uploadProject,
    tzOffsetMinutes: url.searchParams.get("tz"),
  });
  const loaded = await captureUsageOperation(
    "usage.export.csv",
    () => listUsageRecords(userId, filters, USAGE_EXPORT_MAX_ROWS + 1),
    {
      slowMs: 2_000,
      metadata: { rangeDays: filters.days },
      summarize: (value) => ({ rows: value.length }),
    },
  );
  if (!loaded.ok) {
    return noStoreJson(
      { ok: false, error: "export_failed", reference: loaded.reference },
      { status: 500 },
    );
  }
  const records = loaded.value;
  const { rows: exported, truncated } = capUsageExportRows(records, USAGE_EXPORT_MAX_ROWS);
  return new Response(recordsToCsv(exported), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${usageCsvFilename(filters)}"`,
      "Cache-Control": "no-store",
      "X-Usage-Export-Truncated": String(truncated),
      "X-Usage-Export-Row-Limit": String(USAGE_EXPORT_MAX_ROWS),
      "X-Usage-Export-Rows": String(exported.length),
      "Server-Timing": `usage-export;dur=${loaded.durationMs}`,
    },
  });
}

/* 其他方法一律拒绝(纯导出端点,避免误用)。 */
export async function POST() {
  return noStoreJson({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
