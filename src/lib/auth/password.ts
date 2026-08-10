/* 邮箱+密码凭证:scrypt 散列(node:crypto 内置,零依赖)。
   存储格式 scrypt$N$r$p$salt_b64url$hash_b64url,校验用 timingSafeEqual。
   用同步版:注册/登录是低频路径,~50ms 计算可接受且省去 promisify 类型包袱。 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.N) || params.N > 1_048_576) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length, params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 190);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 190;
}

export function passwordPolicyError(password: string): "too_short" | "too_long" | null {
  if (password.length < PASSWORD_MIN) return "too_short";
  if (password.length > PASSWORD_MAX) return "too_long";
  return null;
}
