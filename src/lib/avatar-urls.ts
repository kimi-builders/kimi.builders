/* Persisted avatar URL allowlist. Visitors' browsers request avatars
   directly from many places, so only our media host or explicit OAuth
   provider image hosts are allowed — members cannot plant tracking
   pixels. */

export const DEFAULT_AVATAR_CDN_BASE_URL = "https://cdn.kimi.builders";
export const OAUTH_AVATAR_EXACT_HOSTS = ["avatars.githubusercontent.com"] as const;
export const OAUTH_AVATAR_HOST_SUFFIXES = [".googleusercontent.com"] as const;

function ownAvatarHost(): string {
  const configured = process.env.R2_PUBLIC_BASE_URL || DEFAULT_AVATAR_CDN_BASE_URL;
  try {
    return new URL(configured).host;
  } catch {
    return new URL(DEFAULT_AVATAR_CDN_BASE_URL).host;
  }
}

export function isOwnAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host === ownAvatarHost()
    );
  } catch {
    return false;
  }
}

export function isAllowedAvatarUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw) return false;
  if (isOwnAvatarUrl(raw)) return true;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if ((OAUTH_AVATAR_EXACT_HOSTS as readonly string[]).includes(host)) return true;
    return OAUTH_AVATAR_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

export function allowedProviderAvatar(url: string): string {
  const trimmed = url.trim().slice(0, 500);
  return isAllowedAvatarUrl(trimmed) && !isOwnAvatarUrl(trimmed) ? trimmed : "";
}
