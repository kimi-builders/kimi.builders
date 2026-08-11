-- 忘记密码:一次性密码重置 token。
-- 安全模型:64 位 hex 随机明文只进邮件;库中只存 HMAC-SHA256(token, AUTH_SECRET)。
-- 签发新 token 时作废旧 token(置 used_at);消费是单条原子 UPDATE
-- (存在/未用/未过期才命中),天然单次使用、防重放。1 小时有效。

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL COMMENT 'HMAC-SHA256 hex;不落明文',
  expires_at DATETIME NOT NULL COMMENT 'UTC,签发后 1 小时',
  used_at DATETIME NULL COMMENT '消费/作废时间;NULL=未使用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reset_token_hash (token_hash),
  KEY idx_reset_user (user_id),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
