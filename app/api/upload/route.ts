import { getSessionUser } from "@/src/lib/auth/session";
import {
  isMediaKind,
  MEDIA_MAX_INPUT_BYTES,
  MediaError,
  processMedia,
} from "@/src/lib/media";
import { consumeCommunityRateLimit } from "@/src/lib/rate-limit";
import { mediaKey, mediaUrl, putMedia, storageConfigured } from "@/src/lib/storage";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";

/* POST /api/upload — 图片上传(multipart:kind=logo|image|avatar + file)。
   登录态 + 同源校验 + 30/小时限流;sharp 归一化为 webp 后写 R2,
   返回内容寻址的 key 与公开 URL。存储未配置时 503(本地开发可跳过)。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ ok: false, error: "bad_origin" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return noStoreJson({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!storageConfigured()) {
    return noStoreJson(
      { ok: false, error: "storage_not_configured" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return noStoreJson({ ok: false, error: "bad_form" }, { status: 400 });
  }
  const kindRaw = String(form.get("kind") ?? "");
  if (!isMediaKind(kindRaw)) {
    return noStoreJson({ ok: false, error: "bad_kind" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return noStoreJson({ ok: false, error: "no_file" }, { status: 400 });
  }
  if (file.size > MEDIA_MAX_INPUT_BYTES) {
    return noStoreJson({ ok: false, error: "too_large" }, { status: 413 });
  }

  const rate = await consumeCommunityRateLimit(user.id, "upload");
  if (!rate.allowed) {
    return noStoreJson(
      { ok: false, error: "rate_limited", retryAfter: rate.retryAfterSeconds },
      { status: 429 },
    );
  }

  let processed;
  try {
    processed = await processMedia(kindRaw, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof MediaError) {
      const status = err.code === "too_large" ? 413 : 415;
      return noStoreJson({ ok: false, error: err.code }, { status });
    }
    throw err;
  }

  const key = mediaKey(kindRaw, processed.body, processed.ext);
  await putMedia(key, processed.body, processed.contentType);
  return noStoreJson({
    ok: true,
    data: {
      key,
      url: mediaUrl(key),
      width: processed.width,
      height: processed.height,
      bytes: processed.body.byteLength,
    },
  });
}
