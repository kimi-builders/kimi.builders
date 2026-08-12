-- /admin 评论治理列表按 hidden_at 状态过滤、id 倒序游标翻页。
-- 复合索引先放等值/状态列，再放排序游标列，避免 hidden 列表全表扫描。
ALTER TABLE comments
  ADD KEY idx_comments_hidden_id (hidden_at, id);
