-- 封面生成器 + 图片适配器(20260908):
-- cover_tone:名称砖(无配图时的列表封面)色调;theme=跟随主题的 moon 面,
--   其余为 src/lib/cover-tones.ts 注册表里的固定色(用户指定后不随主题切换)。
-- cover_fit:封面适配;cover=裁切填满(默认),contain=补边完整(竖屏截图等
--   高瘦图不被拦腰裁)。仅「我的作品」有意义;awesome 条目无媒体,恒为默认值。
ALTER TABLE works
  ADD COLUMN cover_tone VARCHAR(16) NOT NULL DEFAULT 'theme' COMMENT '名称砖色调:theme=跟随主题,其余为注册表固定色 id' AFTER image_keys,
  ADD COLUMN cover_fit VARCHAR(8) NOT NULL DEFAULT 'cover' COMMENT '封面适配:cover=裁切填满,contain=补边完整' AFTER cover_tone;
