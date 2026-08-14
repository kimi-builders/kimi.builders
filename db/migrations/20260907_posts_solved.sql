-- 帖子「已解决」标记(20260907):作者或治理可开关;feed 支持只看已解决,
-- 让同类问题在列表里就能找到答案,不必重复发帖。
ALTER TABLE posts
  ADD COLUMN solved_at DATETIME NULL COMMENT '解决时间;NULL=未解决(作者/治理可切换)' AFTER hidden_by;
