/* Object-storage abstraction (Cloudflare R2, S3-compatible API).
   Environment:
     R2_ENDPOINT            https://<account_id>.r2.cloudflarestorage.com
     R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY   single-bucket read/write token
     R2_BUCKET              defaults to kb-media
     R2_PUBLIC_BASE_URL     public access domain, defaults to
                            https://cdn.kimi.builders
   Keys carry a content hash and the same content is never rewritten;
   uploads set immutable long-cache headers, and the CF proxy cache keeps
   origin operations minimal (R2 bills storage + operations only; egress
   is free). */
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

/* key -> public URL. Storage keeps keys only; URLs are assembled at
   render/response time, so changing domains never touches stored data. */
export function mediaUrl(key: string): string {
  const base = (
    process.env.R2_PUBLIC_BASE_URL || "https://cdn.kimi.builders"
  ).replace(/\/+$/, "");
  return `${base}/${key}`;
}

/* Content-addressed key: prefix/yyyyMM/<hash16>.<ext> — same content,
   same key, dedup for free. */
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
