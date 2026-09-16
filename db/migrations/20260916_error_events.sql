-- 错误可观测性:客户端/服务端错误上报的最小闭环表。
-- 只存排障所需字段;不含原始 IP(user_agent 截断存储),source 为
-- 固定枚举。保留 90 天,由 analytics-retention 定时任务同批清理。
-- user_id 仅作排障线索:账号硬删时不连带删错误记录(置 NULL)。

CREATE TABLE IF NOT EXISTS error_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(16) NOT NULL COMMENT 'client/server/global/csp',
  `release` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'DEPLOYMENT_VERSION(git SHA)',
  url VARCHAR(500) NOT NULL DEFAULT '',
  message VARCHAR(500) NOT NULL,
  stack TEXT NULL,
  user_id BIGINT UNSIGNED NULL COMMENT '上报时登录用户(可空;账号删除后置 NULL)',
  user_agent VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_error_time (created_at),
  KEY idx_error_source (source, created_at),
  CONSTRAINT fk_error_event_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
