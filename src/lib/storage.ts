/* 对象存储抽象层(Cloudflare R2,S3 兼容 API)。
   环境变量:
     R2_ENDPOINT            https://<account_id>.r2.cloudflarestorage.com
     R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY   单 bucket 读写 token
     R2_BUCKET              默认 kb-media
     R2_PUBLIC_BASE_URL     公开访问域名,默认 https://cdn.kimi.builders
   key 带内容哈希、同一内容永不复写,上传即写 immutable 长缓存,
   配合 CF 代理缓存把回源操作压到最低(R2 只对存储量+操作次数计费,流量免费)。 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

let cached: S3Client | null = null;

export function storageConfigured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function client(): S3Client {
  if (!storageConfigured()) throw new Error("storage not configured");
  if (!cached) {
    cached = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return cached;
}

export function mediaBucket(): string {
  return process.env.R2_BUCKET || "kb-media";
}

/* key → 公开 URL。存储侧只落 key,URL 在渲染/响应时拼接,换域名不动存量数据。 */
export function mediaUrl(key: string): string {
  const base = (
    process.env.R2_PUBLIC_BASE_URL || "https://cdn.kimi.builders"
  ).replace(/\/+$/, "");
  return `${base}/${key}`;
}

/* 内容寻址 key:prefix/yyyyMM/<hash16>.<ext> —— 同内容同 key,天然去重 */
export function mediaKey(prefix: string, body: Buffer, ext = "webp"): string {
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  return `${prefix}/${month}/${hash}.${ext}`;
}

export async function putMedia(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: mediaBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}
