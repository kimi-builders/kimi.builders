/* Work media key validation: pure functions, no server dependencies,
   shared by client components (WorkMediaFields) and the action layer.
   Keys must match the shape minted by POST /api/upload
   (content-addressed, see storage.ts mediaKey); re-validated before
   writing so hand-crafted hidden-field values cannot pass. Logo takes the
   logo/ prefix only, images the image/ prefix only. */
export const WORK_IMAGE_MAX = 9;

const WORK_MEDIA_KEY_RE = /^(logo|image)\/\d{6}\/[0-9a-f]{16}\.webp$/;

export function isWorkMediaKey(key: string): boolean {
  return WORK_MEDIA_KEY_RE.test(key);
}

/* Logo key: empty = none; non-empty must be a valid logo/-prefixed media
   key. */
export function isWorkLogoKey(key: string): boolean {
  return key === "" || (isWorkMediaKey(key) && key.startsWith("logo/"));
}

/* Image key array: <=9 entries, all valid image/-prefixed keys (first =
   cover; order is semantic). */
export function areWorkImageKeys(keys: string[]): boolean {
  return (
    keys.length <= WORK_IMAGE_MAX &&
    keys.every((k) => isWorkMediaKey(k) && k.startsWith("image/"))
  );
}

/* Form hidden-field imageKeys (JSON string) parsing: empty = no images;
   invalid JSON / non-string array -> null (callers treat as validation
   failure, never silently swallowed). */
export function parseWorkImageKeysInput(raw: string): string[] | null {
  if (!raw.trim()) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || v.some((k) => typeof k !== "string")) return null;
    return v as string[];
  } catch {
    return null;
  }
}
