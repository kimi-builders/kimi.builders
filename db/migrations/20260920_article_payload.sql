-- 月刊组装制(plan-monthly-learn-launch.md §一):articles 加 payload JSON 列,
-- 承载 kind='letter' 期次的编辑元数据 —— 治理公示条目(governance)、议题覆盖
-- (agenda.postIds/deliveries)、AI 参与披露(aiDisclosure)、官方回音状态(response)。
-- 三层结构的主体由 src/lib/monthly.ts 从真实数据(社区统计/usage/featured/posts)
-- 组装,payload 只存数据给不了的编辑定夺;NULL = 无附加元数据(全部走自动组装)。
-- schema.sql 已同步终态。

ALTER TABLE articles
  ADD COLUMN payload JSON NULL COMMENT 'letter 期次元数据(src/lib/monthly.ts LetterPayload);NULL=纯自动组装' AFTER body_md;
