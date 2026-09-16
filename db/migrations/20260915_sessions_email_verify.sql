-- 会话管理(B3-④):从无状态签名 cookie 升级为服务端会话登记。
-- 动机:会话列表/逐个注销/登出所有设备/改密踢会话,无状态令牌做不到。
-- 令牌形态沿用 password_reset_tokens 的约定:随机明文只在 cookie,
-- 库里只存 HMAC-SHA256 域分隔哈希。ua 为设备摘要(浏览器/系统,英文中性)。

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL COMMENT 'HMAC-SHA256 hex;不落明文',
  ua VARCHAR(160) NOT NULL DEFAULT '' COMMENT '设备摘要,如 Chrome · macOS',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近活跃(节流更新)',
  UNIQUE KEY uq_session_token (token_hash),
  KEY idx_session_user (user_id, last_seen_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 邮箱验证与换邮箱令牌(B3-②/③):复用 password_reset_tokens 的
-- HMAC+原子消费模式。purpose=verify 验证当前邮箱;change 携带
-- new_email,确认后原子换绑。签发新令牌作废旧令牌(同 purpose)。

CREATE TABLE IF NOT EXISTS email_verify_tokens (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('verify','change') NOT NULL,
  new_email VARCHAR(190) NULL COMMENT 'change:待确认的新邮箱;verify 为 NULL',
  token_hash CHAR(64) NOT NULL COMMENT 'HMAC-SHA256 hex;不落明文',
  expires_at DATETIME NOT NULL COMMENT 'UTC,签发后 24 小时',
  used_at DATETIME NULL COMMENT '消费/作废时间;NULL=未使用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_token_hash (token_hash),
  KEY idx_email_token_user (user_id, purpose),
  CONSTRAINT fk_email_token_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
