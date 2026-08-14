-- 名称砖暖纯色化(20260914):固定色档从冷灰系换成暖纯色系
-- (杏黄/赤陶/枫红/苔绿/石墨);theme 档改深空/温暖白(样式在 globals.css)。
-- 旧色档 id 映射到相近新色,保留作者已做的选择:
UPDATE works SET cover_tone = 'graphite'   WHERE cover_tone = 'slate';
UPDATE works SET cover_tone = 'apricot'    WHERE cover_tone = 'abyss';
UPDATE works SET cover_tone = 'maple'      WHERE cover_tone = 'plum';
UPDATE works SET cover_tone = 'terracotta' WHERE cover_tone = 'rust';
-- 'moss' 保留(id 未变,色值换成暖绿)。
