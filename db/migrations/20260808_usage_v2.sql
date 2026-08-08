-- Usage ingest v2 (Phase 1, MySQL 8+).
-- Safe to run repeatedly: tables use IF NOT EXISTS and legacy rows upsert by
-- deterministic natural keys. Existing usage_daily rows remain untouched.

CREATE TABLE IF NOT EXISTS usage_devices (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  public_id VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  platform VARCHAR(16) NOT NULL DEFAULT 'unknown',
  surface VARCHAR(20) NOT NULL DEFAULT 'cli',
  client_version VARCHAR(40) NOT NULL DEFAULT '',
  parser_version VARCHAR(40) NOT NULL DEFAULT '',
  last_seen_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_usage_device_public (public_id),
  KEY idx_usage_device_user (user_id, revoked_at),
  CONSTRAINT fk_usage_device_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_api_keys (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT UNSIGNED NOT NULL,
  prefix VARCHAR(16) NOT NULL,
  secret_hash BINARY(32) NOT NULL,
  scopes VARCHAR(120) NOT NULL DEFAULT 'ingest,read,settings,delete',
  last_used_at DATETIME(3) NULL,
  expires_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_usage_key_hash (secret_hash),
  KEY idx_usage_key_prefix (prefix),
  KEY idx_usage_key_device (device_id, revoked_at),
  CONSTRAINT fk_usage_key_device FOREIGN KEY (device_id) REFERENCES usage_devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_device_codes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  device_code_hash BINARY(32) NOT NULL,
  user_code_hash BINARY(32) NOT NULL,
  client_name VARCHAR(80) NOT NULL,
  requested_device_name VARCHAR(80) NOT NULL DEFAULT '',
  approved_device_name VARCHAR(80) NOT NULL DEFAULT '',
  platform VARCHAR(16) NOT NULL DEFAULT 'unknown',
  surface VARCHAR(20) NOT NULL DEFAULT 'cli',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/denied/expired/delivered',
  interval_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  next_poll_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  approved_user_id BIGINT UNSIGNED NULL,
  approved_at DATETIME(3) NULL,
  denied_at DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_usage_device_code (device_code_hash),
  UNIQUE KEY uq_usage_user_code (user_code_hash),
  KEY idx_usage_device_code_expiry (status, expires_at),
  CONSTRAINT fk_usage_code_user FOREIGN KEY (approved_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_settings (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  upload_project TINYINT(1) NOT NULL DEFAULT 0,
  upload_device_label TINYINT(1) NOT NULL DEFAULT 0,
  upload_quota TINYINT(1) NOT NULL DEFAULT 0,
  retention_days SMALLINT UNSIGNED NOT NULL DEFAULT 365,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_usage_setting_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_buckets (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(40) NOT NULL,
  model VARCHAR(160) NOT NULL,
  project_label VARCHAR(120) NULL,
  project_hash BINARY(32) NOT NULL,
  bucket_start DATETIME(3) NOT NULL,
  input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cache_write_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cache_read_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reasoning_output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  credit_units DECIMAL(20,6) NULL,
  measurement VARCHAR(16) NOT NULL DEFAULT 'exact' COMMENT 'exact/estimated/credit/legacy',
  cost_micros BIGINT UNSIGNED NULL COMMENT 'versioned server estimate; legacy rows preserve their old value',
  legacy_active_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  legacy_session_count INT UNSIGNED NOT NULL DEFAULT 0,
  sync_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_usage_bucket (user_id, device_id, source, model, project_hash, bucket_start),
  KEY idx_usage_bucket_user_time (user_id, bucket_start),
  KEY idx_usage_bucket_source_time (user_id, source, bucket_start),
  KEY idx_usage_bucket_model_time (user_id, model, bucket_start),
  KEY idx_usage_bucket_device_time (user_id, device_id, bucket_start),
  CONSTRAINT fk_usage_bucket_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_usage_bucket_device FOREIGN KEY (device_id) REFERENCES usage_devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(40) NOT NULL,
  session_hash BINARY(32) NOT NULL,
  project_label VARCHAR(120) NULL,
  project_hash BINARY(32) NOT NULL,
  first_message_at DATETIME(3) NOT NULL,
  last_message_at DATETIME(3) NOT NULL,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  active_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  message_count INT UNSIGNED NOT NULL DEFAULT 0,
  user_message_count INT UNSIGNED NOT NULL DEFAULT 0,
  user_prompt_hours JSON NOT NULL,
  sync_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_usage_session (user_id, device_id, source, session_hash),
  KEY idx_usage_session_user_time (user_id, first_message_at),
  KEY idx_usage_session_source_time (user_id, source, first_message_at),
  KEY idx_usage_session_device_time (user_id, device_id, first_message_at),
  CONSTRAINT fk_usage_session_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_usage_session_device FOREIGN KEY (device_id) REFERENCES usage_devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Durable, privacy-preserving limits for public device-code endpoints. Raw IPs,
-- device codes and user codes are never stored here.
CREATE TABLE IF NOT EXISTS usage_rate_limits (
  scope VARCHAR(40) NOT NULL,
  identity_hash BINARY(32) NOT NULL,
  window_start DATETIME(3) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, identity_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO usage_settings (user_id)
SELECT id FROM users
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);

-- Give each user with v1 data one deterministic, revoked legacy device. It is
-- visible for provenance but can never authenticate or receive new writes.
INSERT INTO usage_devices
  (user_id, public_id, name, platform, surface, client_version, parser_version, revoked_at)
SELECT DISTINCT
  d.user_id,
  CONCAT('legacy_', LEFT(SHA2(CONCAT('kimi.builders/usage/', d.user_id), 256), 24)),
  'Legacy Kimi sync',
  'unknown',
  'migration',
  'v1',
  'v1',
  UTC_TIMESTAMP(3)
FROM usage_daily d
ON DUPLICATE KEY UPDATE public_id = VALUES(public_id);

-- Preserve the old day exactly as a UTC day boundary. The original v1 client
-- did not upload timezone, so no more precise conversion is possible.
INSERT INTO usage_buckets
  (user_id, device_id, source, model, project_hash, bucket_start,
   input_tokens, cache_read_input_tokens, output_tokens, request_count,
   measurement, cost_micros, legacy_active_seconds, legacy_session_count)
SELECT
  d.user_id,
  dev.id,
  'kimi-code',
  'legacy/unknown',
  UNHEX(SHA2('', 256)),
  CAST(d.day AS DATETIME),
  d.tokens_in,
  d.tokens_cached,
  d.tokens_out,
  d.messages,
  'legacy',
  d.cost_micros,
  d.active_seconds,
  d.sessions
FROM usage_daily d
JOIN usage_devices dev
  ON dev.public_id = CONCAT('legacy_', LEFT(SHA2(CONCAT('kimi.builders/usage/', d.user_id), 256), 24))
ON DUPLICATE KEY UPDATE
  input_tokens = VALUES(input_tokens),
  cache_read_input_tokens = VALUES(cache_read_input_tokens),
  output_tokens = VALUES(output_tokens),
  request_count = VALUES(request_count),
  cost_micros = VALUES(cost_micros),
  legacy_active_seconds = VALUES(legacy_active_seconds),
  legacy_session_count = VALUES(legacy_session_count),
  measurement = 'legacy';
