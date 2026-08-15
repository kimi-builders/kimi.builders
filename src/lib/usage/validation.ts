import { gunzipSync } from "node:zlib";
import {
  USAGE_INGEST_PROTOCOL_VERSION,
  isUsageSourceId,
  type UsageBucketV2,
  type UsageClientMetaV2,
  type UsageIngestRequestV2,
  type UsageSessionV2,
  type UsageSessionHourV2,
} from "../usage-contract";
import type { UsageSettings } from "./settings";

const MAX_COMPRESSED_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_BUCKETS = 5_000;
const MAX_SESSIONS = 2_000;
const MAX_TOKEN_COUNT = 1_000_000_000_000_000;
const MAX_COUNT = 1_000_000_000;
const MAX_SECONDS = 366 * 24 * 60 * 60;
const MAX_ACTIVITY_HOURS_PER_SESSION = 2_000;

export class UsageRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function usageErrorResponse(error: unknown): Response {
  if (error instanceof UsageRequestError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("usage request failed", error);
  return Response.json(
    { ok: false, error: { code: "internal_error", message: "Usage request failed." } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function readUsageJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COMPRESSED_BYTES) {
    throw new UsageRequestError("payload_too_large", "Compressed request exceeds 1 MiB.", 413);
  }
  const encoded = Buffer.from(await request.arrayBuffer());
  if (encoded.length > MAX_COMPRESSED_BYTES) {
    throw new UsageRequestError("payload_too_large", "Compressed request exceeds 1 MiB.", 413);
  }
  const encoding = request.headers.get("content-encoding")?.toLowerCase() || "identity";
  let raw: Buffer;
  try {
    if (encoding === "gzip") {
      raw = gunzipSync(encoded, { maxOutputLength: MAX_BODY_BYTES });
    } else if (encoding === "identity") {
      raw = encoded;
    } else {
      throw new UsageRequestError(
        "unsupported_encoding",
        "Only identity and gzip content encodings are supported.",
        415,
      );
    }
  } catch (error) {
    if (error instanceof UsageRequestError) throw error;
    throw new UsageRequestError("invalid_gzip", "Unable to decompress request body.");
  }
  if (raw.length > MAX_BODY_BYTES) {
    throw new UsageRequestError("payload_too_large", "Request exceeds 5 MiB after decoding.", 413);
  }
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new UsageRequestError("invalid_json", "Request body must be valid JSON.");
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UsageRequestError("invalid_payload", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new UsageRequestError("invalid_payload", `${field} must be a string.`);
  }
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength || /[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new UsageRequestError("invalid_payload", `${field} is invalid.`);
  }
  return cleaned;
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, field, maxLength);
}

function safeInteger(value: unknown, field: string, max = MAX_TOKEN_COUNT): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) {
    throw new UsageRequestError(
      "invalid_payload",
      `${field} must be a non-negative safe integer no greater than ${max}.`,
    );
  }
  return Number(value);
}

function finiteNumber(value: unknown, field: string, max = MAX_TOKEN_COUNT): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    throw new UsageRequestError("invalid_payload", `${field} must be a non-negative number.`);
  }
  return value;
}

function timestamp(value: unknown, field: string): string {
  const raw = text(value, field, 35);
  const date = new Date(raw);
  const time = date.getTime();
  const now = Date.now();
  const earliest = now - 5 * 366 * 24 * 60 * 60 * 1000;
  const latest = now + 10 * 60 * 1000;
  if (!Number.isFinite(time) || time < earliest || time > latest) {
    throw new UsageRequestError("invalid_timestamp", `${field} is outside the accepted window.`);
  }
  return date.toISOString();
}

function project(value: unknown, field: string, settings: UsageSettings): string | undefined {
  if (value === undefined) return undefined;
  if (!settings.uploadProject) {
    throw new UsageRequestError(
      "project_upload_disabled",
      "Project fields must be omitted while project upload is disabled.",
    );
  }
  const label = text(value, field, 120);
  if (label === "." || label === ".." || /[\\/]/.test(label)) {
    throw new UsageRequestError("invalid_project", `${field} must be a directory basename.`);
  }
  return label;
}

function clientMeta(value: unknown): UsageClientMetaV2 {
  const input = record(value, "client");
  const surfaces = new Set(["cli", "daemon", "local-dashboard", "mac-app", "windows-app"]);
  const platforms = new Set(["darwin", "linux", "win32"]);
  const surface = text(input.surface, "client.surface", 20);
  const platform = text(input.platform, "client.platform", 16);
  const syncId = text(input.syncId, "client.syncId", 36);
  if (!surfaces.has(surface)) {
    throw new UsageRequestError("invalid_payload", "client.surface is unsupported.");
  }
  if (!platforms.has(platform)) {
    throw new UsageRequestError("invalid_payload", "client.platform is unsupported.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncId)) {
    throw new UsageRequestError("invalid_payload", "client.syncId must be a UUID.");
  }
  const batchIndex = safeInteger(input.batchIndex, "client.batchIndex", 9_999);
  const batchCount = safeInteger(input.batchCount, "client.batchCount", 10_000);
  if (batchCount < 1 || batchIndex >= batchCount) {
    throw new UsageRequestError("invalid_payload", "client batch metadata is inconsistent.");
  }
  let device: UsageClientMetaV2["device"];
  if (input.device !== undefined) {
    const rawDevice = record(input.device, "client.device");
    const terminal = record(rawDevice.terminal, "client.device.terminal");
    const os = record(rawDevice.os, "client.device.os");
    device = {
      terminal: {
        name: text(terminal.name, "client.device.terminal.name", 60),
        ...(optionalText(terminal.version, "client.device.terminal.version", 80)
          ? { version: optionalText(terminal.version, "client.device.terminal.version", 80) }
          : {}),
        ...(optionalText(terminal.confidence, "client.device.terminal.confidence", 16)
          ? {
              confidence: (() => {
                const confidence = optionalText(
                  terminal.confidence,
                  "client.device.terminal.confidence",
                  16,
                );
                if (confidence !== "detected" && confidence !== "fallback") {
                  throw new UsageRequestError(
                    "invalid_payload",
                    "client.device.terminal.confidence is unsupported.",
                  );
                }
                return confidence;
              })(),
            }
          : {}),
      },
      os: {
        name: text(os.name, "client.device.os.name", 40),
        ...(optionalText(os.version, "client.device.os.version", 60)
          ? { version: optionalText(os.version, "client.device.os.version", 60) }
          : {}),
        ...(optionalText(os.architecture, "client.device.os.architecture", 24)
          ? { architecture: optionalText(os.architecture, "client.device.os.architecture", 24) }
          : {}),
      },
    };
  }
  let agentVersions: UsageClientMetaV2["agentVersions"];
  if (input.agentVersions !== undefined) {
    const rawVersions = record(input.agentVersions, "client.agentVersions");
    const entries = Object.entries(rawVersions);
    if (entries.length > 32) {
      throw new UsageRequestError("invalid_payload", "client.agentVersions has too many entries.");
    }
    agentVersions = {};
    for (const [source, version] of entries) {
      if (!isUsageSourceId(source)) {
        throw new UsageRequestError("unknown_source", `Unknown Agent version source: ${source}`);
      }
      agentVersions[source] = text(version, `client.agentVersions.${source}`, 80);
    }
  }
  return {
    surface: surface as UsageClientMetaV2["surface"],
    surfaceVersion: text(input.surfaceVersion, "client.surfaceVersion", 40),
    parserVersion: text(input.parserVersion, "client.parserVersion", 40),
    platform: platform as UsageClientMetaV2["platform"],
    syncId,
    batchIndex,
    batchCount,
    ...(device ? { device } : {}),
    ...(agentVersions ? { agentVersions } : {}),
  };
}

function bucket(value: unknown, index: number, settings: UsageSettings): UsageBucketV2 {
  const input = record(value, `buckets[${index}]`);
  const source = text(input.source, `buckets[${index}].source`, 40);
  if (!isUsageSourceId(source)) {
    throw new UsageRequestError("unknown_source", `Unknown source: ${source}`);
  }
  const bucketStart = timestamp(input.bucketStart, `buckets[${index}].bucketStart`);
  const date = new Date(bucketStart);
  if (date.getUTCMinutes() % 30 !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) {
    throw new UsageRequestError(
      "invalid_timestamp",
      `buckets[${index}].bucketStart must align to a UTC 30-minute boundary.`,
    );
  }
  const measurement = text(input.measurement, `buckets[${index}].measurement`, 16);
  if (!new Set(["exact", "estimated", "credit"]).has(measurement)) {
    throw new UsageRequestError("invalid_payload", "Collectors cannot upload this measurement type.");
  }
  const creditUnits =
    input.creditUnits === undefined
      ? undefined
      : finiteNumber(input.creditUnits, `buckets[${index}].creditUnits`);
  const contextTier = optionalText(input.contextTier, `buckets[${index}].contextTier`, 16);
  if (contextTier && contextTier !== "short" && contextTier !== "long") {
    throw new UsageRequestError("invalid_payload", `buckets[${index}].contextTier is unsupported.`);
  }
  const processingTier = optionalText(
    input.processingTier,
    `buckets[${index}].processingTier`,
    16,
  );
  if (
    processingTier &&
    !new Set(["standard", "batch", "flex", "priority"]).has(processingTier)
  ) {
    throw new UsageRequestError(
      "invalid_payload",
      `buckets[${index}].processingTier is unsupported.`,
    );
  }
  const cacheWriteInputTokens = safeInteger(
    input.cacheWriteInputTokens,
    `buckets[${index}].cacheWriteInputTokens`,
  );
  const cacheWrite5mInputTokens = input.cacheWrite5mInputTokens === undefined
    ? 0
    : safeInteger(
        input.cacheWrite5mInputTokens,
        `buckets[${index}].cacheWrite5mInputTokens`,
      );
  const cacheWrite1hInputTokens = input.cacheWrite1hInputTokens === undefined
    ? 0
    : safeInteger(
        input.cacheWrite1hInputTokens,
        `buckets[${index}].cacheWrite1hInputTokens`,
      );
  if (cacheWrite5mInputTokens + cacheWrite1hInputTokens > cacheWriteInputTokens) {
    throw new UsageRequestError(
      "invalid_payload",
      `buckets[${index}] cache-write TTL partitions exceed cacheWriteInputTokens.`,
    );
  }
  return {
    source,
    model: text(input.model, `buckets[${index}].model`, 160),
    ...(optionalText(input.modelCanonical, `buckets[${index}].modelCanonical`, 160)
      ? { modelCanonical: optionalText(input.modelCanonical, `buckets[${index}].modelCanonical`, 160) }
      : {}),
    ...(optionalText(input.modelProvider, `buckets[${index}].modelProvider`, 80)
      ? { modelProvider: optionalText(input.modelProvider, `buckets[${index}].modelProvider`, 80) }
      : {}),
    ...(optionalText(input.reasoningEffort, `buckets[${index}].reasoningEffort`, 32)
      ? { reasoningEffort: optionalText(input.reasoningEffort, `buckets[${index}].reasoningEffort`, 32)?.toLowerCase() }
      : {}),
    ...(optionalText(input.agentVersion, `buckets[${index}].agentVersion`, 80)
      ? { agentVersion: optionalText(input.agentVersion, `buckets[${index}].agentVersion`, 80) }
      : {}),
    ...(contextTier ? { contextTier: contextTier as UsageBucketV2["contextTier"] } : {}),
    ...(processingTier
      ? { processingTier: processingTier as UsageBucketV2["processingTier"] }
      : {}),
    bucketStart,
    project: project(input.project, `buckets[${index}].project`, settings),
    inputTokens: safeInteger(input.inputTokens, `buckets[${index}].inputTokens`),
    cacheWriteInputTokens,
    ...(cacheWrite5mInputTokens > 0 ? { cacheWrite5mInputTokens } : {}),
    ...(cacheWrite1hInputTokens > 0 ? { cacheWrite1hInputTokens } : {}),
    cacheReadInputTokens: safeInteger(
      input.cacheReadInputTokens,
      `buckets[${index}].cacheReadInputTokens`,
    ),
    outputTokens: safeInteger(input.outputTokens, `buckets[${index}].outputTokens`),
    reasoningOutputTokens: safeInteger(
      input.reasoningOutputTokens,
      `buckets[${index}].reasoningOutputTokens`,
    ),
    requestCount: safeInteger(input.requestCount, `buckets[${index}].requestCount`, MAX_COUNT),
    ...(creditUnits === undefined ? {} : { creditUnits }),
    measurement: measurement as UsageBucketV2["measurement"],
  };
}

function session(value: unknown, index: number, settings: UsageSettings): UsageSessionV2 {
  const input = record(value, `sessions[${index}]`);
  const source = text(input.source, `sessions[${index}].source`, 40);
  if (!isUsageSourceId(source)) {
    throw new UsageRequestError("unknown_source", `Unknown source: ${source}`);
  }
  const sessionHash = text(input.sessionHash, `sessions[${index}].sessionHash`, 64);
  if (!/^[0-9a-f]{64}$/i.test(sessionHash)) {
    throw new UsageRequestError(
      "invalid_session_hash",
      `sessions[${index}].sessionHash must be a 64-character HMAC-SHA-256 hex digest.`,
    );
  }
  const firstMessageAt = timestamp(input.firstMessageAt, `sessions[${index}].firstMessageAt`);
  const lastMessageAt = timestamp(input.lastMessageAt, `sessions[${index}].lastMessageAt`);
  if (Date.parse(lastMessageAt) < Date.parse(firstMessageAt)) {
    throw new UsageRequestError("invalid_timestamp", "Session end precedes session start.");
  }
  if (!Array.isArray(input.userPromptHours) || input.userPromptHours.length !== 24) {
    throw new UsageRequestError(
      "invalid_payload",
      `sessions[${index}].userPromptHours must contain exactly 24 counters.`,
    );
  }
  const durationSeconds = safeInteger(
    input.durationSeconds,
    `sessions[${index}].durationSeconds`,
    MAX_SECONDS,
  );
  const activeSeconds = safeInteger(
    input.activeSeconds,
    `sessions[${index}].activeSeconds`,
    MAX_SECONDS,
  );
  const userMessageCount = safeInteger(
    input.userMessageCount,
    `sessions[${index}].userMessageCount`,
    MAX_COUNT,
  );
  let activityHours: UsageSessionHourV2[] | undefined;
  if (input.activityHours !== undefined) {
    if (
      !Array.isArray(input.activityHours) ||
      input.activityHours.length > MAX_ACTIVITY_HOURS_PER_SESSION
    ) {
      throw new UsageRequestError(
        "invalid_payload",
        `sessions[${index}].activityHours must contain at most ${MAX_ACTIVITY_HOURS_PER_SESSION} items.`,
      );
    }
    const seen = new Set<string>();
    let hasExtendedHours = false;
    activityHours = input.activityHours.map((value, hourIndex) => {
      const item = record(value, `sessions[${index}].activityHours[${hourIndex}]`);
      const hourStart = timestamp(
        item.hourStart,
        `sessions[${index}].activityHours[${hourIndex}].hourStart`,
      );
      const date = new Date(hourStart);
      if (
        date.getUTCMinutes() !== 0 ||
        date.getUTCSeconds() !== 0 ||
        date.getUTCMilliseconds() !== 0 ||
        seen.has(hourStart)
      ) {
        throw new UsageRequestError(
          "invalid_payload",
          `sessions[${index}].activityHours must use unique UTC hour boundaries.`,
        );
      }
      seen.add(hourStart);
      const firstHour = Math.floor(Date.parse(firstMessageAt) / 3_600_000) * 3_600_000;
      const lastHour = Math.floor(Date.parse(lastMessageAt) / 3_600_000) * 3_600_000;
      if (date.getTime() < firstHour || date.getTime() > lastHour) {
        throw new UsageRequestError(
          "invalid_payload",
          `sessions[${index}].activityHours must stay inside the session window.`,
        );
      }
      const hasEngaged = item.engagedSeconds !== undefined;
      const hasMessages = item.messageCount !== undefined;
      if (hasEngaged !== hasMessages) {
        throw new UsageRequestError(
          "invalid_payload",
          `sessions[${index}].activityHours[${hourIndex}] must provide engagedSeconds and messageCount together.`,
        );
      }
      hasExtendedHours ||= hasEngaged;
      return {
        hourStart,
        activeSeconds: safeInteger(
          item.activeSeconds,
          `sessions[${index}].activityHours[${hourIndex}].activeSeconds`,
          3_600,
        ),
        userMessageCount: safeInteger(
          item.userMessageCount,
          `sessions[${index}].activityHours[${hourIndex}].userMessageCount`,
          MAX_COUNT,
        ),
        ...(hasEngaged
          ? {
              engagedSeconds: safeInteger(
                item.engagedSeconds,
                `sessions[${index}].activityHours[${hourIndex}].engagedSeconds`,
                3_600,
              ),
              messageCount: safeInteger(
                item.messageCount,
                `sessions[${index}].activityHours[${hourIndex}].messageCount`,
                MAX_COUNT,
              ),
            }
          : {}),
      };
    });
    activityHours.sort((left, right) => left.hourStart.localeCompare(right.hourStart));
    if (
      activityHours.reduce((sum, item) => sum + item.activeSeconds, 0) !== activeSeconds ||
      activityHours.reduce((sum, item) => sum + item.userMessageCount, 0) !== userMessageCount
    ) {
      throw new UsageRequestError(
        "invalid_payload",
        `sessions[${index}].activityHours totals must match the session counters.`,
      );
    }
    if (
      hasExtendedHours &&
      (activityHours.some(
        (item) => item.engagedSeconds === undefined || item.messageCount === undefined,
      ) ||
        activityHours.reduce((sum, item) => sum + (item.engagedSeconds ?? 0), 0) !==
          durationSeconds ||
        activityHours.reduce((sum, item) => sum + (item.messageCount ?? 0), 0) !==
          safeInteger(input.messageCount, `sessions[${index}].messageCount`, MAX_COUNT))
    ) {
      throw new UsageRequestError(
        "invalid_payload",
        `sessions[${index}] extended activity hours must match duration and message counters.`,
      );
    }
  }
  return {
    source,
    ...(optionalText(input.agentVersion, `sessions[${index}].agentVersion`, 80)
      ? { agentVersion: optionalText(input.agentVersion, `sessions[${index}].agentVersion`, 80) }
      : {}),
    sessionHash: sessionHash.toLowerCase(),
    project: project(input.project, `sessions[${index}].project`, settings),
    firstMessageAt,
    lastMessageAt,
    durationSeconds,
    activeSeconds,
    messageCount: safeInteger(input.messageCount, `sessions[${index}].messageCount`, MAX_COUNT),
    userMessageCount,
    userPromptHours: input.userPromptHours.map((count, hour) =>
      safeInteger(count, `sessions[${index}].userPromptHours[${hour}]`, MAX_COUNT),
    ),
    ...(activityHours === undefined ? {} : { activityHours }),
  };
}

export function validateUsageIngest(
  value: unknown,
  settings: UsageSettings,
): UsageIngestRequestV2 {
  const input = record(value, "body");
  if (input.protocolVersion !== USAGE_INGEST_PROTOCOL_VERSION) {
    throw new UsageRequestError(
      "unsupported_protocol",
      `protocolVersion must be ${USAGE_INGEST_PROTOCOL_VERSION}.`,
      409,
    );
  }
  if (!Array.isArray(input.buckets) || input.buckets.length > MAX_BUCKETS) {
    throw new UsageRequestError("invalid_payload", `buckets must contain at most ${MAX_BUCKETS} items.`);
  }
  if (!Array.isArray(input.sessions) || input.sessions.length > MAX_SESSIONS) {
    throw new UsageRequestError(
      "invalid_payload",
      `sessions must contain at most ${MAX_SESSIONS} items.`,
    );
  }
  if (input.quotaSnapshots !== undefined) {
    if (!Array.isArray(input.quotaSnapshots)) {
      throw new UsageRequestError("invalid_payload", "quotaSnapshots must be an array.");
    }
    if (input.quotaSnapshots.length > 0) {
      const code = settings.uploadQuotaSnapshots ? "quota_not_supported" : "quota_upload_disabled";
      throw new UsageRequestError(code, "Quota snapshots are not enabled in Phase 1.", 409);
    }
  }
  return {
    protocolVersion: USAGE_INGEST_PROTOCOL_VERSION,
    client: clientMeta(input.client),
    buckets: input.buckets.map((item, index) => bucket(item, index, settings)),
    sessions: input.sessions.map((item, index) => session(item, index, settings)),
    ...(input.quotaSnapshots === undefined ? {} : { quotaSnapshots: [] }),
  };
}
