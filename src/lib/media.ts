/* 上传图片的 sharp 处理管线:校验 → 归一化 → webp。
   - logo / avatar:方形居中裁剪(attention 定位,尽量保住主体)
   - image:限长边 1600,不放大
   - 限输入字节与像素,防解压炸弹;动图只取首帧(输出静态 webp) */
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

export type MediaErrorCode = "too_large" | "not_image" | "bad_kind";

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

/* multipart 整体 Content-Length 的早期拒绝。缺失/非法长度(chunked 等)不能据此
   判定，继续解析并由 File.size + sharp 输入上限兜底。 */
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
