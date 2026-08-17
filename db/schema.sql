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
  -- profile_show_* 由 20260829_profile_privacy.sql 引入,已有库执行该迁移
  profile_show_avatar TINYINT(1) NOT NULL DEFAULT 1 COMMENT '个人主页展示头像;0=仅自己',
  profile_show_name TINYINT(1) NOT NULL DEFAULT 1 COMMENT '个人主页展示显示名;0=仅显示 @handle',
  profile_show_bio TINYINT(1) NOT NULL DEFAULT 1 COMMENT '个人主页展示简介;0=仅自己',
  locale VARCHAR(8) NOT NULL DEFAULT '' COMMENT 'UI 语言偏好 zh/en,空=自动推断',
  ai_replies_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '全局:允许 AI 回我的帖(v2 决策 3)',
  show_ai_replies TINYINT(1) NOT NULL DEFAULT 1 COMMENT '全局:浏览时显示 AI 回复',
  role VARCHAR(16) NOT NULL DEFAULT 'member' COMMENT 'member/mod/admin',
  -- muted_until 由 20260830_moderation.sql 引入,已有库执行该迁移
  muted_until DATETIME NULL COMMENT '禁言截止;NULL=未禁言,9999-12-31=永久;到期自动解除',
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
  -- hidden_* 由 20260830_moderation.sql 引入,已有库执行该迁移
  hidden_at DATETIME NULL COMMENT '屏蔽时间;NULL=未屏蔽(治理:公开侧不可见,作者可见带标注)',
  hidden_by BIGINT UNSIGNED NULL COMMENT '执行屏蔽的管理员 users.id',
  solved_at DATETIME NULL COMMENT '解决时间;NULL=未解决(20260907,作者/治理可切换)',
  hidden_reason VARCHAR(280) NULL COMMENT '屏蔽原因(展示给作者/管理面)',
  -- featured_* 由 20260817_featured.sql 引入,已有库执行该迁移
  featured_at DATETIME NULL COMMENT '精选时间;NULL=未精选(每周精选 v0)',
  featured_reason VARCHAR(280) NULL COMMENT '精选理由(编辑填写,一句话)',
  featured_by BIGINT UNSIGNED NULL COMMENT '定夺编辑 users.id(admin/mod)',
  KEY idx_feed (category, created_at),
  KEY idx_posts_live_new (deleted_at, created_at, id),
  KEY idx_user (user_id),
  KEY idx_featured (featured_at),
  KEY idx_hidden (hidden_at),
  CONSTRAINT fk_post_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_post_featured FOREIGN KEY (featured_by) REFERENCES users (id),
  CONSTRAINT fk_post_hidden FOREIGN KEY (hidden_by) REFERENCES users (id)
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
  -- hidden_* 由 20260830_moderation.sql 引入,已有库执行该迁移
  hidden_at DATETIME NULL COMMENT '屏蔽时间;NULL=未屏蔽',
  hidden_by BIGINT UNSIGNED NULL COMMENT '执行屏蔽的管理员 users.id',
  hidden_reason VARCHAR(280) NULL COMMENT '屏蔽原因',
  KEY idx_post (post_id, created_at),
  KEY idx_comments_hidden_id (hidden_at, id),
  KEY idx_comments_parent_visible (parent_id, deleted_at, hidden_at, is_ai),
  CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_comment_hidden FOREIGN KEY (hidden_by) REFERENCES users (id)
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
  -- visibility 由 20260828_work_visibility.sql 引入,已有库执行该迁移
  visibility VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT 'public/private(私密=仅作者可见)',
  -- hidden_* 由 20260830_moderation.sql 引入,已有库执行该迁移
  hidden_at DATETIME NULL COMMENT '屏蔽时间;NULL=未屏蔽',
  hidden_by BIGINT UNSIGNED NULL COMMENT '执行屏蔽的管理员 users.id',
  hidden_reason VARCHAR(280) NULL COMMENT '屏蔽原因',
  author_label VARCHAR(120) NOT NULL DEFAULT '' COMMENT 'awesome 条目的外部作者名',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- featured_* 由 20260817_featured.sql 引入,已有库执行该迁移
  featured_at DATETIME NULL COMMENT '精选时间;NULL=未精选(每周精选 v0)',
  featured_reason VARCHAR(280) NULL COMMENT '精选理由(编辑填写,一句话)',
  featured_by BIGINT UNSIGNED NULL COMMENT '定夺编辑 users.id(admin/mod)',
  -- vote_count/comment_count 由 20260821_work_interactions.sql 引入,已有库执行该迁移
  vote_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '支持数(冗余;写路径随 work_votes 维护)',
  comment_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '可见评论数(冗余;软删即减)',
  -- claimed_tokens 由 20260822_work_claims.sql 引入,已有库执行该迁移
  claimed_tokens BIGINT UNSIGNED NULL COMMENT '作者声明的该作品构建投入 tokens;NULL=未声明(声明制:同作者 Σ声明 ≤ 可验证总量)',
  -- status/models/description_md/scope 由 20260824_work_meta.sql 引入,已有库执行该迁移
  status VARCHAR(16) NOT NULL DEFAULT 'released' COMMENT 'planning/building/released/archived',
  models JSON NULL COMMENT '开发模型(家族键或自填型号文本)',
  description_md TEXT NULL COMMENT '作品描述(Markdown);NULL 时详情页用 tagline',
  scope VARCHAR(16) NULL COMMENT 'Awesome 收录口径:base/eco/part;仅 awesome 条目',
  also_awesome TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'site 作品勾选后同时进 Awesome 清单(20260906)',
  -- kind 由 20260825_work_kind.sql 引入(该迁移同时 DROP platforms),已有库执行该迁移
  kind VARCHAR(24) NOT NULL DEFAULT 'app' COMMENT '作品类型:app/miniapp/website/extension/cli/skill/prompt/slides/demo/content/other',
  -- logo_key/image_keys 由 20260826_work_media.sql 引入,已有库执行该迁移
  logo_key VARCHAR(255) NOT NULL DEFAULT '' COMMENT '作品 Logo 存储 key(空=无;URL 渲染时拼接)',
  image_keys JSON NULL COMMENT '配图 key JSON 数组(image/ 前缀,≤9;展示在详情页图集)',
  -- cover_key 由 20260916 引入:独立列表封面(空=走色卡名称砖);
  -- cover_tone/cover_fit 由 20260908 引入;20260916 起色档为 绿/蓝/红/黑 纯平色卡
  cover_key VARCHAR(255) NOT NULL DEFAULT '' COMMENT '独立列表封面(image/ 前缀);空=走色卡名称砖',
  cover_tone VARCHAR(16) NOT NULL DEFAULT 'theme' COMMENT '名称砖色调:theme=跟随主题,其余为注册表固定色 id',
  cover_fit VARCHAR(8) NOT NULL DEFAULT 'cover' COMMENT '封面适配:cover=裁切填满,contain=补边完整',
  -- ai_reply 由 20260816_work_ai_summon.sql 引入,已有库执行该迁移
  ai_reply TINYINT(1) NOT NULL DEFAULT 1 COMMENT '允许 AI 参与本作品评论区(@kimi 召唤)',
  -- source_path 由 20260921_works_source_path.sql 引入,已有库执行该迁移
  source_path VARCHAR(64) NULL COMMENT '毕业归因:来源学习路径 slug(app/(app)/learn/_data.ts);NULL=非路径来源',
  KEY idx_source (source, created_at),
  KEY idx_hidden (hidden_at),
  KEY idx_featured (featured_at),
  KEY idx_source_path (source_path),
  CONSTRAINT fk_work_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_work_featured FOREIGN KEY (featured_by) REFERENCES users (id),
  CONSTRAINT fk_work_hidden FOREIGN KEY (hidden_by) REFERENCES users (id)
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
  show_on_leaderboard TINYINT(1) NOT NULL DEFAULT 0 COMMENT '自愿公开聚合用量(社区榜/热力图/作品徽章);1=公开,0=不公开(默认)',
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
-- attempts/last_attempt_at 由 20260816_ai_reply_retry.sql 引入,已有库执行该迁移。
CREATE TABLE IF NOT EXISTS ai_reply_jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NULL,
  comment_id BIGINT UNSIGNED NULL COMMENT '触发回复的评论;NULL=回复帖子本身',
  kind VARCHAR(16) NOT NULL DEFAULT 'auto' COMMENT 'auto=回帖 chain=接话 mention=召唤(20260816)',
  work_id BIGINT UNSIGNED NULL COMMENT '作品召唤目标(post 任务为 NULL)',
  work_comment_id BIGINT UNSIGNED NULL COMMENT '触发召唤的作品评论',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/done/failed/skipped',
  error VARCHAR(500) NOT NULL DEFAULT '',
  attempts INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已执行次数(含手动重跑)',
  last_attempt_at DATETIME NULL COMMENT '最近一次开始执行的时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  KEY idx_status (status, created_at),
  CONSTRAINT fk_job_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_job_work FOREIGN KEY (work_id) REFERENCES works (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 消息通知(评论了关注的帖子 / 回复了我的评论;actor NULL = AI 或系统)
-- work_id/work_comment_id 由 20260816_work_ai_summon.sql 引入(作品召唤回复通知),
-- 同迁移把 post_id/comment_id 放宽为 NULL(work 通知不绑帖子),已有库执行该迁移。
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL COMMENT '接收者',
  actor_id BIGINT UNSIGNED NULL COMMENT '触发者;NULL=AI/系统',
  type VARCHAR(16) NOT NULL DEFAULT 'comment' COMMENT 'comment/reply',
  post_id BIGINT UNSIGNED NULL,
  comment_id BIGINT UNSIGNED NULL COMMENT '触达锚点 /community/<post>#comment-<id>',
  work_id BIGINT UNSIGNED NULL COMMENT '作品通知目标(post 通知为 NULL)',
  work_comment_id BIGINT UNSIGNED NULL COMMENT '作品评论锚点 /works/<id>#work-comment-<cid>',
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_unread (user_id, read_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 文章引擎(S3-1):一张表承载 /blog 月刊(letter)与 /learn 策划路径(guide)。
-- 双语版本 = 同 slug 两行不同 locale,(slug, locale) 复合唯一;草稿 = published_at NULL;
-- 软删 deleted_at 风格对齐 posts。已有库执行 db/migrations/20260819_articles.sql。
CREATE TABLE IF NOT EXISTS articles (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL COMMENT 'URL 标识:小写字母/数字/连字符;与 locale 复合唯一',
  kind VARCHAR(16) NOT NULL DEFAULT 'letter' COMMENT 'letter=月刊 / guide=学习路径长文',
  locale VARCHAR(8) NOT NULL DEFAULT 'zh' COMMENT 'zh/en;双语版本 = 同 slug 两行',
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '' COMMENT '列表摘要',
  body_md MEDIUMTEXT COMMENT 'Markdown 正文',
  -- payload 由 20260920_article_payload.sql 引入,已有库执行该迁移
  payload JSON NULL COMMENT 'letter 期次元数据(src/lib/monthly.ts LetterPayload);NULL=纯自动组装',
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

-- ---------------------------------------------------------------------------
-- Demo Night v0(第三步,P3 提前):线上报名 + 归档页。
-- 由 20260820_demo_night.sql 引入,已有库执行该迁移。
-- 核心语义:到场名单公开 —— 报名即同意公开 handle 进该场到场名单,
-- 名单按报名时间正序(先到场先署名),到场本身就是稀缺背书。
-- events 创建 / 改状态 / 回填回放链接在 v0 直接 SQL 运维,无站内后台;
-- starts_at 按 UTC 存储与展示。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS demo_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL,
  starts_at DATETIME NOT NULL COMMENT '开场时间(UTC,页面原样展示并标注)',
  description TEXT COMMENT 'Markdown 短文本(议程 / 分享人 / 玩法)',
  location_note VARCHAR(200) NOT NULL DEFAULT '' COMMENT '如「线上 · 会议链接报名后可见」',
  stream_url VARCHAR(500) NULL COMMENT '直播/回放链接;NULL=未公开',
  status VARCHAR(16) NOT NULL DEFAULT 'upcoming' COMMENT 'upcoming/done(手工切换)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_demo_event_status_time (status, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 报名记录:复合主键天然幂等(重复报名 INSERT IGNORE 不报错、不重复署名)。
-- 无软删:取消报名即物理删除,名单只反映当前在场的人。
CREATE TABLE IF NOT EXISTS demo_rsvps (
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报名时间 = 署名顺序',
  PRIMARY KEY (event_id, user_id),
  KEY idx_demo_rsvp_user (user_id),
  CONSTRAINT fk_demo_rsvp_event FOREIGN KEY (event_id) REFERENCES demo_events (id) ON DELETE CASCADE,
  CONSTRAINT fk_demo_rsvp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 作品互动(P1-2):支持 + 单层评论。
-- 由 20260821_work_interactions.sql 引入,已有库执行该迁移。
-- 支持只有「顶」没有踩,再点取消;复合主键天然幂等。
-- 评论单层、软删;评论作者本人或作品作者可删(权限钉在 SQL WHERE)。
-- AI 评论(is_ai=1, user_id NULL)由 20260816_work_ai_summon.sql 引入(@kimi 召唤)。
-- works.vote_count / comment_count 为冗余计数(同 posts 模式),写路径维护。
-- ---------------------------------------------------------------------------

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
  user_id BIGINT UNSIGNED NULL COMMENT '评论作者;NULL=AI',
  is_ai TINYINT(1) NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_work_comment_work (work_id, id),
  CONSTRAINT fk_work_comment_work FOREIGN KEY (work_id) REFERENCES works (id) ON DELETE CASCADE,
  CONSTRAINT fk_work_comment_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 忘记密码:一次性密码重置 token(迁移 20260827)。
-- 只存 HMAC-SHA256(token, AUTH_SECRET),不落明文;签发新作废旧;原子消费防重放。
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 社区治理审计(迁移 20260830):所有管理动作必写 —— 屏蔽/解除/软删/硬删/
-- 禁言/解禁/资料重置/角色变更。倒序分页在 /admin 日志页签。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS moderation_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NOT NULL COMMENT '操作者(admin/mod)users.id',
  action VARCHAR(24) NOT NULL COMMENT 'hide/unhide/delete/hard_delete/mute/unmute/profile_reset/role_grant/role_revoke',
  target_type VARCHAR(16) NOT NULL COMMENT 'post/comment/work/user',
  target_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(280) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_created (created_at),
  KEY idx_target (target_type, target_id),
  CONSTRAINT fk_mod_action_actor FOREIGN KEY (actor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 位置价值分析 v1(迁移 20260903):只存计数事件与当日去重访客 HMAC。
-- 不存 user_id、完整 URL、referrer、原始 IP 或 User-Agent 原文。
-- ---------------------------------------------------------------------------

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
