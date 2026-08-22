/* Sharp pipeline for uploaded images: validate -> normalize -> webp.
   - logo / avatar: square center-crop (attention positioning, keeps the
     subject)
   - image: long side capped at 1600, never upscaled
   - input bytes and pixels capped against decompression bombs; animations
     take the first frame (static webp output) */
import sharp, { type OutputInfo } from "sharp";

export type MediaKind = "logo" | "image" | "avatar";

export const MEDIA_MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

export interface ProcessedMedia {
  body: Buffer;
  width: number;
  height: number;
  contentType: "image/webp";
  ext: "webp";
}

export type MediaErrorCode = "too_large" | "not_image" | "bad_kind" | "svg_not_allowed";

export class MediaError extends Error {
  constructor(public readonly code: MediaErrorCode) {
    super(code);
    this.name = "MediaError";
  }
}

const KIND_RULES: Record<
  MediaKind,
  { square?: number; maxSide?: number; quality: number }
> = {
  logo: { square: 512, quality: 85 },
  avatar: { square: 256, quality: 85 },
  image: { maxSide: 1600, quality: 80 },
};

export function isMediaKind(value: string): value is MediaKind {
  return value === "logo" || value === "image" || value === "avatar";
}

/* Early rejection on the multipart Content-Length. A missing/invalid
   length (chunked etc.) cannot decide anything here — keep parsing and
   let File.size + the sharp input cap catch it. */
export function isUploadContentLengthTooLarge(
  contentLength: string | null,
): boolean {
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  return Number(contentLength) > MEDIA_MAX_INPUT_BYTES;
}

export async function processMedia(
  kind: MediaKind,
  input: Buffer,
): Promise<ProcessedMedia> {
  const rules = KIND_RULES[kind];
  if (!rules) throw new MediaError("bad_kind");
  if (input.byteLength > MEDIA_MAX_INPUT_BYTES) throw new MediaError("too_large");

  const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  try {
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new MediaError("not_image");
    /* SVG is rejected explicitly: sharp (librsvg) can rasterize SVG, but
       SVG can carry external references (an SSRF surface) and script
       semantics — the content-addressed bucket takes bitmaps only; judged
       by the detected format, never the declared Content-Type. */
    if (meta.format === "svg") throw new MediaError("svg_not_allowed");
  } catch (err) {
    if (err instanceof MediaError) throw err;
    throw new MediaError("not_image");
  }

  if (rules.square) {
    pipeline.resize(rules.square, rules.square, {
      fit: "cover",
      position: "attention",
    });
  } else if (rules.maxSide) {
    pipeline.resize(rules.maxSide, rules.maxSide, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await pipeline
      .webp({ quality: rules.quality })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new MediaError("not_image");
  }
  return {
    body: out.data,
    width: out.info.width,
    height: out.info.height,
    contentType: "image/webp",
    ext: "webp",
  };
}
