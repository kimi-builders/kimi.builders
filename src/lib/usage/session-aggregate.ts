import type { RowDataPacket } from "mysql2";
import type { UsageFilters } from "./filters";
import type { UsageHeatmap, UsageTrendDay } from "./query-types";

interface SessionAggregateTarget {
  sessions: number;
  messages: number;
  userMessages: number;
  activeSeconds: number;
  durationSeconds: number;
}

interface ParsedSessionHour {
  hourStart: Date;
  activeSeconds: number;
  engagedSeconds: number | null;
  messageCount: number | null;
  userMessageCount: number;
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

function trendKeyFromInstant(value: Date, filters: UsageFilters): string {
  const local = new Date(value.getTime() + filters.tzOffsetMinutes * 60_000);
  if (filters.granularity === "hour") {
    return `${local.toISOString().slice(0, 13).replace("T", " ")}:00`;
  }
  if (filters.granularity === "week") {
    local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  }
  return local.toISOString().slice(0, 10);
}

function sessionHoursOf(row: RowDataPacket): {
  version: 2 | 3;
  hours: ParsedSessionHour[];
} | null {
  let value: unknown = row.user_prompt_hours;
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const version = num((value as { version?: unknown }).version);
  const rawHours = (value as { hours?: unknown }).hours;
  if ((version !== 2 && version !== 3) || !Array.isArray(rawHours)) return null;
  const hours: ParsedSessionHour[] = [];
  for (const rawHour of rawHours) {
    if (!rawHour || typeof rawHour !== "object" || Array.isArray(rawHour)) continue;
    const item = rawHour as Record<string, unknown>;
    const hourStart = new Date(item.hourStart as string);
    if (Number.isNaN(hourStart.getTime())) continue;
    hours.push({
      hourStart,
      activeSeconds: num(item.activeSeconds),
      engagedSeconds: version === 3 ? num(item.engagedSeconds) : null,
      messageCount: version === 3 ? num(item.messageCount) : null,
      userMessageCount: num(item.userMessageCount),
    });
  }
  return { version, hours };
}

export function createEmptyUsageHeatmap(): UsageHeatmap {
  const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  return {
    tokens: grid(),
    inputTokens: grid(),
    cacheWriteInputTokens: grid(),
    cacheReadInputTokens: grid(),
    outputTokens: grid(),
    reasoningOutputTokens: grid(),
    costMicros: grid(),
    activeSeconds: grid(),
    prompts: grid(),
    hasData: Array.from({ length: 7 }, () => Array<boolean>(24).fill(false)),
  };
}

/* 跨日会话只按 [from,to) 内的 UTC 小时事实累计；v2/legacy 保留受控回退。 */
export function aggregateUsageSessionRows(
  rows: RowDataPacket[],
  filters: UsageFilters,
  target: SessionAggregateTarget,
  options?: {
    ensureDay?: (key: string) => UsageTrendDay;
    heatmap?: UsageHeatmap;
  },
): Set<string> {
  const devices = new Set<string>();
  const inRange = (date: Date) => date >= filters.from && date < filters.to;
  const placeHour = (hour: ParsedSessionHour) => {
    const local = new Date(hour.hourStart.getTime() + filters.tzOffsetMinutes * 60_000);
    const weekday = (local.getUTCDay() + 6) % 7;
    const localHour = local.getUTCHours();
    if (options?.heatmap) {
      options.heatmap.activeSeconds[weekday][localHour] += hour.activeSeconds;
      options.heatmap.prompts[weekday][localHour] += hour.userMessageCount;
      options.heatmap.hasData[weekday][localHour] = true;
    }
    const day = options?.ensureDay?.(trendKeyFromInstant(hour.hourStart, filters));
    if (day) day.activeSeconds += hour.activeSeconds;
  };

  for (const row of rows) {
    const firstAt = new Date(row.first_message_at as string);
    if (Number.isNaN(firstAt.getTime())) continue;
    const parsed = sessionHoursOf(row);
    if (parsed) {
      const selected = parsed.hours.filter((hour) => inRange(hour.hourStart));
      if (selected.length === 0) continue;
      devices.add(String(row.device_id));
      target.sessions += 1;
      const firstDay = options?.ensureDay?.(trendKeyFromInstant(selected[0].hourStart, filters));
      if (firstDay) firstDay.sessions += 1;
      for (const hour of selected) {
        target.activeSeconds += hour.activeSeconds;
        target.userMessages += hour.userMessageCount;
        placeHour(hour);
        if (parsed.version === 3) {
          target.durationSeconds += hour.engagedSeconds ?? 0;
          target.messages += hour.messageCount ?? 0;
        }
      }
      if (parsed.version === 2 && inRange(firstAt)) {
        target.durationSeconds += num(row.duration_seconds);
        target.messages += num(row.message_count);
      }
      continue;
    }

    if (!inRange(firstAt)) continue;
    devices.add(String(row.device_id));
    target.sessions += 1;
    target.activeSeconds += num(row.active_seconds);
    target.durationSeconds += num(row.duration_seconds);
    target.messages += num(row.message_count);
    target.userMessages += num(row.user_message_count);
    const day = options?.ensureDay?.(trendKeyFromInstant(firstAt, filters));
    if (day) {
      day.sessions += 1;
      day.activeSeconds += num(row.active_seconds);
    }
    if (!options?.heatmap) continue;
    const local = new Date(firstAt.getTime() + filters.tzOffsetMinutes * 60_000);
    options.heatmap.activeSeconds[(local.getUTCDay() + 6) % 7][local.getUTCHours()] +=
      num(row.active_seconds);
    let promptHours: unknown = row.user_prompt_hours;
    try {
      if (typeof promptHours === "string") promptHours = JSON.parse(promptHours);
    } catch {
      promptHours = null;
    }
    if (!Array.isArray(promptHours) || promptHours.length !== 24) continue;
    const firstUtcDay = Date.UTC(
      firstAt.getUTCFullYear(),
      firstAt.getUTCMonth(),
      firstAt.getUTCDate(),
    );
    promptHours.forEach((count, utcHour) => {
      const amount = num(count);
      if (amount <= 0) return;
      const promptLocal = new Date(
        firstUtcDay + utcHour * 3_600_000 + filters.tzOffsetMinutes * 60_000,
      );
      options.heatmap!.prompts[(promptLocal.getUTCDay() + 6) % 7][promptLocal.getUTCHours()] +=
        amount;
    });
  }
  return devices;
}
