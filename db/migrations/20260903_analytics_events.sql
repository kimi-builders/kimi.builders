-- 位置价值分析 v1:只存计数事件与当日去重访客 HMAC。
-- 不存 user_id、完整 URL、referrer、原始 IP 或 User-Agent 原文。
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event VARCHAR(40) NOT NULL,
  target_kind VARCHAR(16) NOT NULL DEFAULT '',
  target_id VARCHAR(64) NOT NULL DEFAULT '',
  meta JSON NULL,
  viewer CHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_event_time (event, created_at),
  KEY idx_target (target_kind, target_id, created_at)
);
