import { randomUUID } from "node:crypto";

type UsageLogValue = string | number | boolean;

export type UsageOperationResult<T> =
  | { ok: true; value: T; durationMs: number }
  | { ok: false; reference: string; durationMs: number };

function errorSummary(error: unknown): Record<string, string> {
  if (!error || typeof error !== "object") {
    return { errorName: "UnknownError", errorMessage: String(error).slice(0, 500) };
  }
  const value = error as { name?: unknown; message?: unknown; code?: unknown };
  return {
    errorName: String(value.name ?? "Error").slice(0, 80),
    errorMessage: String(value.message ?? "Unknown error").slice(0, 500),
    ...(value.code ? { errorCode: String(value.code).slice(0, 80) } : {}),
  };
}

/* Structured logs searchable by event, operation, and reference. Failures and
   slow operations are always logged; USAGE_OBSERVABILITY_VERBOSE=1 also logs
   successful ones. Metadata accepts only caller-provided low-cardinality
   fields: never project names, device names, or filter values. */
export async function captureUsageOperation<T>(
  operation: string,
  work: () => Promise<T>,
  options: {
    slowMs?: number;
    metadata?: Record<string, UsageLogValue>;
    summarize?: (value: T) => Record<string, UsageLogValue>;
  } = {},
): Promise<UsageOperationResult<T>> {
  const startedAt = performance.now();
  const slowMs = options.slowMs ?? 1_500;
  try {
    const value = await work();
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= slowMs || process.env.USAGE_OBSERVABILITY_VERBOSE === "1") {
      console.info(JSON.stringify({
        event: "usage.operation",
        operation,
        status: "ok",
        durationMs,
        slow: durationMs >= slowMs,
        ...options.metadata,
        ...options.summarize?.(value),
      }));
    }
    return { ok: true, value, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    const reference = `usage_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    console.error(JSON.stringify({
      event: "usage.operation",
      operation,
      status: "error",
      reference,
      durationMs,
      ...options.metadata,
      ...errorSummary(error),
    }));
    return { ok: false, reference, durationMs };
  }
}
