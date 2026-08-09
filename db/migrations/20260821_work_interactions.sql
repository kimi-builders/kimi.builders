-- 作品详情互动(P1-2,review-2026-08 欠账):支持(work_votes)+ 单层评论(work_comments)。
-- 支持只有「顶」没有踩,再点一次取消;复合主键天然幂等(并发重复 INSERT IGNORE 不报错)。
-- 评论从简:单层(无楼中楼)、软删;评论作者本人或作品作者可删,权限钉在 SQL WHERE。
-- works 冗余 vote_count / comment_count(对齐 posts.score/comment_count 模式),写路径维护。

CREATE TABLE IF NOT EXISTS work_votes (
  work_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (work_id, user_id),
  KEY idx_work_vote_user (user_id),
  CONSTRAINT fk_work_vote_work FOREIGN KEY (work_id) REFERENCES works (id) ON DELETE CASCADE,
  CONSTRAINT fk_work_vote_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_comments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  work_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL COMMENT '评论作者;AI 不介入作品评论(无 is_ai)',
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_work_comment_work (work_id, id),
  CONSTRAINT fk_work_comment_work FOREIGN KEY (work_id) REFERENCES works (id) ON DELETE CASCADE,
  CONSTRAINT fk_work_comment_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE works
  ADD COLUMN vote_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '支持数(冗余;写路径随 work_votes 维护)',
  ADD COLUMN comment_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '可见评论数(冗余;软删即减)';
