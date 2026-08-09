export interface UsageDeviceLabelInput {
  name?: unknown;
  platform?: unknown;
  surface?: unknown;
  clientVersion?: unknown;
  parserVersion?: unknown;
  terminalName?: unknown;
  terminalVersion?: unknown;
  osName?: unknown;
  osVersion?: unknown;
  architecture?: unknown;
  agentVersions?: unknown;
}

const GENERIC_DEVICE_NAMES = [
  /^kimi code(?: cli)?$/i,
  /^kimi code\s*\((?:darwin|linux|win32|unknown)\)$/i,
  /^kimi builders usage$/i,
  /^(?:cli|terminal|background sync|macos app|windows app)\s*·\s*(?:macos|windows|linux|unknown os)$/i,
];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function usagePlatformLabel(platform: unknown): string {
  switch (text(platform).toLowerCase()) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return "Unknown OS";
  }
}

export function usageSurfaceLabel(surface: unknown): string {
  switch (text(surface).toLowerCase()) {
    case "daemon":
      return "Background sync";
    case "mac-app":
      return "macOS App";
    case "windows-app":
      return "Windows App";
    case "cli":
      return "CLI";
    default:
      return "Client";
  }
}

export function isGenericUsageDeviceName(name: unknown): boolean {
  const value = text(name);
  return !value || GENERIC_DEVICE_NAMES.some((pattern) => pattern.test(value));
}

/*
 * New collectors send a factual terminal + OS label. Older collectors sent
 * "Kimi Code (darwin)", which described a parsed source rather than the device.
 * Preserve user-edited names, but replace those known generated values with
 * facts already stored on usage_devices.
 */
export function usageDeviceDisplayName(device: UsageDeviceLabelInput): string {
  const name = text(device.name);
  if (!isGenericUsageDeviceName(name)) return name;

  const parts = [
    text(device.terminalName) || usageSurfaceLabel(device.surface),
    text(device.osName) || usagePlatformLabel(device.platform),
  ];
  return parts.join(" · ");
}

export function parseUsageAgentVersions(value: unknown): Record<string, string> {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return {};
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  return Object.fromEntries(
    Object.entries(candidate)
      .filter(([source, version]) => source && typeof version === "string" && version.trim())
      .map(([source, version]) => [source, String(version).trim()]),
  );
}

export function usageDeviceDetail(device: UsageDeviceLabelInput): string {
  const terminalName = text(device.terminalName) || usageSurfaceLabel(device.surface);
  const terminalVersion = text(device.terminalVersion);
  const osName = text(device.osName) || usagePlatformLabel(device.platform);
  const osVersion = text(device.osVersion);
  const architecture = text(device.architecture);
  const clientVersion = text(device.clientVersion).replace(/^v/i, "");
  const parserVersion = text(device.parserVersion);
  const parts = [
    `${terminalName}${terminalVersion ? ` ${terminalVersion}` : ""}`,
    `${osName}${osVersion ? ` ${osVersion}` : ""}${architecture ? ` (${architecture})` : ""}`,
  ];
  if (clientVersion && clientVersion !== "0.0.0" && clientVersion.toLowerCase() !== "unknown") {
    parts.push(`Collector v${clientVersion}`);
  }
  if (parserVersion) parts.push(`Parser ${parserVersion}`);
  return parts.join(" · ");
}
