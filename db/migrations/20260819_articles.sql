-- S3-1 文章引擎:一张表同时承载 /blog 月刊(kind='letter')
-- 与 /learn 策划制学习路径(kind='guide')。
-- 双语版本 = 同 slug 两行不同 locale,唯一约束是 (slug, locale) 复合唯一——
-- 同一 slug 允许中英各一行,也允许 letter/guide 复用同一 slug(路由树不同:/blog 与 /learn)。
-- published_at NULL = 草稿(前台列表/详情均不露出);撤稿 = 重新置 NULL。
-- 软删 deleted_at 风格对齐 posts。schema.sql 已同步终态。

CREATE TABLE IF NOT EXISTS articles (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL COMMENT 'URL 标识:小写字母/数字/连字符;与 locale 复合唯一',
  kind VARCHAR(16) NOT NULL DEFAULT 'letter' COMMENT 'letter=月刊 / guide=学习路径长文',
  locale VARCHAR(8) NOT NULL DEFAULT 'zh' COMMENT 'zh/en;双语版本 = 同 slug 两行',
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '' COMMENT '列表摘要',
  body_md MEDIUMTEXT COMMENT 'Markdown 正文',
  author_id BIGINT UNSIGNED NOT NULL COMMENT '署名编辑 users.id(admin/mod)',
  sort_order INT NOT NULL DEFAULT 0 COMMENT 'guide 的策划顺序(小的在前);letter 不用',
  published_at DATETIME NULL COMMENT '发布时间;NULL=草稿',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_article_slug_locale (slug, locale),
  KEY idx_articles_list (kind, published_at),
  CONSTRAINT fk_article_author FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
