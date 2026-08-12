-- 作品可见性(2026-08,照抄 posts.visibility 语义):
--   visibility  public/private(私密=仅作者/推荐人本人可见)。
-- 存量行默认 public,行为不变;user_id 为 NULL 的编辑收录条目恒 public
-- (不经表单,无开关)。私密条目的全口径过滤在 src/lib/works.ts:
-- 列表/详情/相关/右栏统计/精选/海报/主页页签,访客一律不可见。

ALTER TABLE works
  ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT 'public/private(私密=仅作者可见)' AFTER source;
