export interface UsageDeviceLabelInput {
  name?: unknown;
  platform?: unknown;
  surface?: unknown;
  clientVersion?: unknown;
}

const GENERIC_DEVICE_NAMES = [
  /^kimi code(?: cli)?$/i,
  /^kimi code\s*\((?:darwin|linux|win32|unknown)\)$/i,
  /^kimi builders usage$/i,
  /^(?:terminal|background sync|macos app|windows app)\s*·\s*(?:macos|windows|linux|unknown os)$/i,
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
    default:
      return "Terminal";
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

  const parts = [usageSurfaceLabel(device.surface), usagePlatformLabel(device.platform)];
  const version = text(device.clientVersion).replace(/^v/i, "");
  if (version && version !== "0.0.0" && version.toLowerCase() !== "unknown") {
    parts.push(`v${version}`);
  }
  return parts.join(" · ");
}
