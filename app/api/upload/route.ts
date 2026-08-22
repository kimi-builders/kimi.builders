import { getSessionUser } from "@/src/lib/auth/session";
import {
  isMediaKind,
  isUploadContentLengthTooLarge,
  MEDIA_MAX_INPUT_BYTES,
  MediaError,
  processMedia,
} from "@/src/lib/media";
import { consumeCommunityRateLimit } from "@/src/lib/rate-limit";
import { mediaKey, mediaUrl, putMedia, storageConfigured } from "@/src/lib/storage";
import { isSameOrigin, noStoreJson } from "@/src/lib/usage/http";

/* POST /api/upload — image upload (multipart: kind=logo|image|avatar +
   file). Login + same-origin check + 30/hour rate limit; sharp
   normalizes to webp and the result lands in R2, returning the
   content-addressed key and public URL. 503 when storage is unconfigured
   (local dev can skip). */
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

  /* Consume quota before touching the body — over-limit accounts never
     get to spend multipart parsing. */
  const rate = await consumeCommunityRateLimit(user.id, "upload");
  if (!rate.allowed) {
    return noStoreJson(
      { ok: false, error: "rate_limited", retryAfter: rate.retryAfterSeconds },
      { status: 429 },
    );
  }

  /* The reverse proxy should also enforce its own hard limit (set by
     the deploy owner). The app layer rejects early on a trusted
     Content-Length before formData(); chunked bodies with no length
     still hit the sharp caps below. */
  if (isUploadContentLengthTooLarge(request.headers.get("content-length"))) {
    return noStoreJson({ ok: false, error: "too_large" }, { status: 413 });
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
