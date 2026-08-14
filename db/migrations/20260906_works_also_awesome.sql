-- 作品「同时收录到 Awesome」开关:成员作品(source=site)默认不进 Awesome 清单,
-- 作者在表单显式勾选才进。awesome 推荐条目恒在清单内,此列对它们无意义。
ALTER TABLE works
  ADD COLUMN also_awesome TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'site 作品勾选后同时进 Awesome 清单(20260906)' AFTER scope;
