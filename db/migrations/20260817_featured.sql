-- 每周精选 v0(P1-7):编辑(admin/mod)给帖子/作品打精选 —— 署名 + 一句话理由,
-- 首页精选位与右栏 widget 展示。featured_at 非空即精选态,取消时三字段一起清空。

ALTER TABLE posts
  ADD COLUMN featured_at DATETIME NULL COMMENT '精选时间;NULL=未精选' AFTER deleted_at,
  ADD COLUMN featured_reason VARCHAR(280) NULL COMMENT '精选理由(编辑填写,一句话)' AFTER featured_at,
  ADD COLUMN featured_by BIGINT UNSIGNED NULL COMMENT '定夺编辑 users.id(admin/mod)' AFTER featured_reason,
  ADD KEY idx_featured (featured_at),
  ADD CONSTRAINT fk_post_featured FOREIGN KEY (featured_by) REFERENCES users (id);

ALTER TABLE works
  ADD COLUMN featured_at DATETIME NULL COMMENT '精选时间;NULL=未精选' AFTER created_at,
  ADD COLUMN featured_reason VARCHAR(280) NULL COMMENT '精选理由(编辑填写,一句话)' AFTER featured_at,
  ADD COLUMN featured_by BIGINT UNSIGNED NULL COMMENT '定夺编辑 users.id(admin/mod)' AFTER featured_reason,
  ADD KEY idx_featured (featured_at),
  ADD CONSTRAINT fk_work_featured FOREIGN KEY (featured_by) REFERENCES users (id);
