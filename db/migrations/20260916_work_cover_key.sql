-- 列表封面独立(20260916):封面不再取「配图第一张」,新增 cover_key 独立字段;
-- 存量作品把首图回填为封面,视觉不回归。色板换 跟随主题/绿/蓝/红/黑 纯平色
-- (取代 20260914 的暖纯色档;砖面织纹同步下线,纯样式改动不在此迁移)。
ALTER TABLE works
  ADD COLUMN cover_key VARCHAR(255) NOT NULL DEFAULT '' COMMENT '独立列表封面(image/ 前缀);空=走色卡名称砖' AFTER image_keys;

UPDATE works
SET cover_key = JSON_UNQUOTE(JSON_EXTRACT(image_keys, '$[0]'))
WHERE source = 'site' AND cover_key = ''
  AND image_keys IS NOT NULL AND JSON_LENGTH(image_keys) > 0;

UPDATE works SET cover_tone = 'green' WHERE cover_tone = 'moss';
UPDATE works SET cover_tone = 'blue'  WHERE cover_tone IN ('apricot', 'abyss');
UPDATE works SET cover_tone = 'red'   WHERE cover_tone IN ('maple', 'terracotta', 'plum', 'rust');
UPDATE works SET cover_tone = 'black' WHERE cover_tone IN ('graphite', 'slate');
