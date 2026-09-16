-- 内容反馈(B2):普通成员的就地反馈通道,补齐社区自净闭环。
-- 词汇刻意避开「举报」:小社区标记感觉不对的内容,管理员清理或屏蔽。
-- 审核台只处理 open;resolver 置位即 resolved,不做处理工作流。
-- reason 固定枚举(spam/abuse/offtopic/privacy/other),note 为补充说明。

CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  reporter_id BIGINT UNSIGNED NOT NULL COMMENT '反馈人',
  target_type ENUM('post','comment','work','work_comment') NOT NULL COMMENT '被反馈对象',
  target_id BIGINT UNSIGNED NOT NULL COMMENT '对象 id(多态,无 FK:目标可能先被删)',
  reason VARCHAR(24) NOT NULL COMMENT 'spam/abuse/offtopic/privacy/other',
  note VARCHAR(500) NULL COMMENT '补充说明(可空)',
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  resolver_id BIGINT UNSIGNED NULL COMMENT '处理人(admin/mod)',
  KEY idx_feedback_open (status, created_at),
  KEY idx_feedback_target (target_type, target_id),
  CONSTRAINT fk_feedback_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_resolver FOREIGN KEY (resolver_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
