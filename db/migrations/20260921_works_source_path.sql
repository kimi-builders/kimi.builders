-- 毕业归因(20260921,知识库机械结构 plan-monthly-learn-launch §二.5):
-- 作品记录来源学习路径。/works/new?path=<slug> 带入来源上下文,发布时随表单
-- 落库(action 层按在册路径校验,非法 slug 置 NULL,不写脏数据);
-- 归因在发布时定死,编辑作品不再改(updateWork 不涉及此列)。
-- 轻量归因只到「来源路径」为止(不做学习打卡,plan §四)。
-- 消费方:路径详情页成就区(真实毕业作品)+ 北极星 #5「路径毕业作品数」:
--   works WHERE source = 'site' AND source_path = '<slug>'(公开未屏蔽)。

ALTER TABLE works
  ADD COLUMN source_path VARCHAR(64) NULL COMMENT '毕业归因:来源学习路径 slug(app/(app)/learn/_data.ts);NULL=非路径来源',
  ADD KEY idx_source_path (source_path);
