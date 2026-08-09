-- kimi.builders 社区数据库 v1 schema(MySQL 8+,utf8mb4)
-- 在 RDS 上: CREATE DATABASE kimi_builders DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 然后执行本文件。幂等:全部 CREATE TABLE IF NOT EXISTS。

-- 用户(浏览全站无需账号;发帖/投票/同步用量才需要)
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  handle VARCHAR(32) NOT NULL UNIQUE COMMENT '@handle,登录后首次生成,可改',
  name VARCHAR(64) NOT NULL DEFAULT '',
  email VARCHAR(190) UNIQUE,
  avatar_url VARCHAR(500) NOT NULL DEFAULT '',
  bio VARCHAR(300) NOT NULL DEFAULT '',
  locale VARCHAR(8) NOT NULL DEFAULT '' COMMENT 'UI 语言偏好 zh/en,空=自动推断',
  ai_replies_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '全局:允许 AI 回我的帖(v2 决策 3)',
  show_ai_replies TINYINT(1) NOT NULL DEFAULT 1 COMMENT '全局:浏览时显示 AI 回复',
  role VARCHAR(16) NOT NULL DEFAULT 'member' COMMENT 'member/mod/admin',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth 账号绑定(GitHub / Google …,一个用户可绑多个)
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_account_id VARCHAR(190) NOT NULL,
  access_token TEXT,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_account (provider, provider_account_id),
  KEY idx_user (user_id),
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 帖子(text/link/poll/image/work 五种内容类型;标题非强制,至少标题或正文其一)
CREATE TABLE IF NOT EXISTS posts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'text' COMMENT 'text/link/poll/image/work',
  category VARCHAR(32) NOT NULL DEFAULT 'chat' COMMENT 'announcement/showcase/help/chat/feedback',
  title VARCHAR(200) NOT NULL DEFAULT '',
  body_md MEDIUMTEXT COMMENT 'Markdown 正文',
  link_url VARCHAR(500) NOT NULL DEFAULT '',
  lang VARCHAR(8) NOT NULL DEFAULT '' COMMENT '发帖语言,空=自动检测',
  ai_reply TINYINT(1) NOT NULL DEFAULT 1 COMMENT '本帖允许 AI 回帖(默认开,v2 决策 3)',
  visibility VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT 'public/private(私密=仅作者可见)',
  score INT NOT NULL DEFAULT 0 COMMENT '顶-踩 净分',
  comment_count INT UNSIGNED NOT NULL DEFAULT 0,
  view_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '浏览量,先记录不展示',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  edited_at DATETIME NULL COMMENT '最后一次编辑时间(正文/标题)',
  deleted_at DATETIME NULL,
  KEY idx_feed (category, created_at),
  KEY idx_user (user_id),
  CONSTRAINT fk_post_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 投票选项与投票记录
CREATE TABLE IF NOT EXISTS poll_options (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(200) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  vote_count INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_post (post_id),
  CONSTRAINT fk_option_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS poll_votes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  option_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_option_user (option_id, user_id),
  CONSTRAINT fk_vote_option FOREIGN KEY (option_id) REFERENCES poll_options (id) ON DELETE CASCADE,
  CONSTRAINT fk_vote_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评论(user_id 为空 + is_ai=1 即 AI bot 回复;parent_id 楼中楼,展示拍平两层)
CREATE TABLE IF NOT EXISTS comments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  is_ai TINYINT(1) NOT NULL DEFAULT 0,
  body_md TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0 COMMENT '顶-踩 净分;≤-3 展示侧淡化',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at DATETIME NULL,
  deleted_at DATETIME NULL,
  KEY idx_post (post_id, created_at),
  CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 反应(顶/赞等,作用于帖子或评论)
CREATE TABLE IF NOT EXISTS reactions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(16) NOT NULL COMMENT 'post/comment',
  target_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'up',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reaction (user_id, target_type, target_id, kind),
  KEY idx_target (target_type, target_id),
  CONSTRAINT fk_reaction_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 关注(P3 启用,先建表)
CREATE TABLE IF NOT EXISTS follows (
  follower_id BIGINT UNSIGNED NOT NULL,
  followee_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT fk_follower FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_followee FOREIGN KEY (followee_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 作品库(user_id 空 = awesome 仓库导入的外部条目)
CREATE TABLE IF NOT EXISTS works (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  tagline VARCHAR(300) NOT NULL DEFAULT '',
  url VARCHAR(500) NOT NULL DEFAULT '',
  repo_url VARCHAR(500) NOT NULL DEFAULT '',
  screenshot_url VARCHAR(500) NOT NULL DEFAULT '',
  tags JSON NULL,
  agents JSON NULL COMMENT '参与构建的 agent 品牌键列表(src/lib/agents.ts)',
  source VARCHAR(16) NOT NULL DEFAULT 'site' COMMENT 'site/awesome',
  author_label VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'awesome 条目的外部作者名',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_source (source, created_at),
  CONSTRAINT fk_work_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Token 用量(本地脚本同步,按天幂等 upsert)
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id BIGINT UNSIGNED NOT NULL,
  day DATE NOT NULL,
  tokens_in BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tokens_out BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tokens_cached BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cost_micros BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '预估费用,微美元',
  active_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  sessions INT UNSIGNED NOT NULL DEFAULT 0,
  messages INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用量 v2:设备授权、按设备 Key、30 分钟事实桶、会话与隐私设置。
-- 已有数据库依次执行 20260808_usage_v2.sql、20260812_usage_metadata.sql
-- 与 20260813_usage_cost_facts.sql、20260814_usage_query_indexes.sql。
CREATE TABLE IF NOT EXISTS usage_devices (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  public_id VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  platform VARCHAR(16) NOT NULL DEFAULT 'unknown',
  surface VARCHAR(20) NOT NULL DEFAULT 'cli',
  client_version VARCHAR(40) NOT NULL DEFAULT '',
  parser_version VARCHAR(40) NOT NULL DEFAULT '',
  terminal_name VARCHAR(60) NOT NULL DEFAULT '',
  terminal_version VARCHAR(80) NOT NULL DEFAULT '',
  terminal_confidence VARCHAR(16) NOT NULL DEFAULT 'unknown',
  os_name VARCHAR(40) NOT NULL DEFAULT '',
  os_version VARCHAR(60) NOT NULL DEFAULT '',
  architecture VARCHAR(24) NOT NULL DEFAULT '',
  agent_versions JSON NULL,
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
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
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
  model_canonical VARCHAR(160) NOT NULL DEFAULT '',
  model_provider VARCHAR(80) NOT NULL DEFAULT '',
  reasoning_effort VARCHAR(32) NOT NULL DEFAULT '',
  agent_version VARCHAR(80) NOT NULL DEFAULT '',
  context_tier VARCHAR(16) NOT NULL DEFAULT '',
  processing_tier VARCHAR(16) NOT NULL DEFAULT '',
  project_label VARCHAR(120) NULL,
  project_hash BINARY(32) NOT NULL,
  bucket_start DATETIME(3) NOT NULL,
  input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cache_write_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cache_write_5m_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cache_write_1h_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cache_read_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  reasoning_output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  credit_units DECIMAL(20,6) NULL,
  measurement VARCHAR(16) NOT NULL DEFAULT 'exact',
  cost_micros BIGINT UNSIGNED NULL,
  legacy_active_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  legacy_session_count INT UNSIGNED NOT NULL DEFAULT 0,
  sync_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_usage_bucket
     (user_id, device_id, source, model, model_provider, reasoning_effort,
     agent_version, context_tier, processing_tier, project_hash, bucket_start),
  KEY idx_usage_bucket_user_time (user_id, bucket_start),
  KEY idx_usage_bucket_source_time (user_id, source, bucket_start),
  KEY idx_usage_bucket_model_time (user_id, model, bucket_start),
  KEY idx_usage_bucket_device_time (user_id, device_id, bucket_start),
  KEY idx_usage_bucket_effort_time (user_id, reasoning_effort, bucket_start),
  KEY idx_usage_bucket_agent_time (user_id, agent_version, bucket_start),
  KEY idx_usage_bucket_context_time (user_id, context_tier, bucket_start),
  KEY idx_usage_bucket_project_time (user_id, project_label, bucket_start),
  CONSTRAINT fk_usage_bucket_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_usage_bucket_device FOREIGN KEY (device_id) REFERENCES usage_devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(40) NOT NULL,
  agent_version VARCHAR(80) NOT NULL DEFAULT '',
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
  KEY idx_usage_session_user_overlap (user_id, last_message_at, first_message_at),
  KEY idx_usage_session_agent_overlap (user_id, agent_version, last_message_at, first_message_at),
  CONSTRAINT fk_usage_session_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_usage_session_device FOREIGN KEY (device_id) REFERENCES usage_devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_rate_limits (
  scope VARCHAR(40) NOT NULL,
  identity_hash BINARY(32) NOT NULL,
  window_start DATETIME(3) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, identity_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 版本化模型价格表(Phase 2;查询期估费,种子数据见 db/migrations/20260809_usage_phase2.sql)
CREATE TABLE IF NOT EXISTS usage_model_prices (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  model_pattern VARCHAR(120) NOT NULL,
  match_kind VARCHAR(8) NOT NULL DEFAULT 'prefix',
  source VARCHAR(40) NULL,
  context_tier VARCHAR(16) NOT NULL DEFAULT '',
  processing_tier VARCHAR(16) NOT NULL DEFAULT 'standard',
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  input_per_mtok DECIMAL(18,6) NOT NULL,
  cache_write_per_mtok DECIMAL(18,6) NULL,
  cache_write_5m_per_mtok DECIMAL(18,6) NULL,
  cache_write_1h_per_mtok DECIMAL(18,6) NULL,
  cache_read_per_mtok DECIMAL(18,6) NULL,
  output_per_mtok DECIMAL(18,6) NOT NULL,
  reasoning_per_mtok DECIMAL(18,6) NULL,
  version VARCHAR(40) NOT NULL,
  pricing_source_url VARCHAR(500) NOT NULL DEFAULT '',
  verified_at DATE NULL,
  pricing_basis VARCHAR(40) NOT NULL DEFAULT 'standard-api',
  note VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_prices_window (effective_from, effective_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 帖子订阅(重点关注的讨论;通知通道后补,先存关系)
CREATE TABLE IF NOT EXISTS post_subscriptions (
  user_id BIGINT UNSIGNED NOT NULL,
  post_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 回帖任务(新帖入库后排队,bot 消费;comment_id 非空 = 回复某条评论)
CREATE TABLE IF NOT EXISTS ai_reply_jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  comment_id BIGINT UNSIGNED NULL COMMENT '触发回复的评论;NULL=回复帖子本身',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/done/failed/skipped',
  error VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  KEY idx_status (status, created_at),
  CONSTRAINT fk_job_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 消息通知(评论了关注的帖子 / 回复了我的评论;actor NULL = AI 或系统)
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL COMMENT '接收者',
  actor_id BIGINT UNSIGNED NULL COMMENT '触发者;NULL=AI/系统',
  type VARCHAR(16) NOT NULL DEFAULT 'comment' COMMENT 'comment/reply',
  post_id BIGINT UNSIGNED NOT NULL,
  comment_id BIGINT UNSIGNED NOT NULL COMMENT '触达锚点 /community/<post>#comment-<id>',
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_unread (user_id, read_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
