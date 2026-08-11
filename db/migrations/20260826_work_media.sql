-- 作品媒体(2026-08,作品多图上传 + Logo 裁剪):
--   logo_key    作品 Logo 的对象存储 key(logo/yyyyMM/<hash16>.webp;空串 = 无 Logo)。
--   image_keys  配图 key JSON 数组(image/ 前缀,≤9 张;第一张 = 封面),NULL = 无配图。
-- DB 只存 key,公开 URL 在渲染时由 src/lib/storage.ts 的 mediaUrl 拼接(换域名不动存量);
-- key 由 POST /api/upload 颁发,服务端写库前再按形状 + 前缀白名单校验。

ALTER TABLE works
  ADD COLUMN logo_key VARCHAR(255) NOT NULL DEFAULT '' COMMENT '作品 Logo 存储 key(空=无;URL 渲染时拼接)' AFTER kind,
  ADD COLUMN image_keys JSON NULL COMMENT '配图 key JSON 数组(image/ 前缀,≤9;第一张为封面)' AFTER logo_key;
