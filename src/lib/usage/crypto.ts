import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function usagePepper(): string {
  const pepper = process.env.USAGE_KEY_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("USAGE_KEY_PEPPER must be configured with at least 32 characters");
  }
  return pepper;
}

export function usageHmac(value: string): Buffer {
  return createHmac("sha256", usagePepper()).update(value, "utf8").digest();
}

export function constantTimeHashEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createUsageApiKey(): string {
  return `kbu_${randomBytes(32).toString("base64url")}`;
}

export function createDeviceCode(): string {
  return `kbd_${randomBytes(32).toString("base64url")}`;
}

export function createDevicePublicId(): string {
  return `udv_${randomBytes(16).toString("base64url")}`;
}

export function createUserCode(): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeUserCode(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(/[-\s]/g, "");
  if (compact.length !== 8) return null;
  for (const character of compact) {
    if (!USER_CODE_ALPHABET.includes(character)) return null;
  }
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function usageKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

export function projectLabelHash(project: string | undefined): Buffer {
  return createHash("sha256").update(project ?? "", "utf8").digest();
}

