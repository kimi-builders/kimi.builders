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
  locale VARCHAR(8) NOT NULL DEFAULT 'zh' COMMENT 'UI 语言偏好 zh/en',
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

-- 帖子(text/link/poll/image/work 五种内容类型)
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
  score INT NOT NULL DEFAULT 0,
  comment_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

-- 评论(user_id 为空 + is_ai=1 即 AI bot 回复)
CREATE TABLE IF NOT EXISTS comments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  is_ai TINYINT(1) NOT NULL DEFAULT 0,
  body_md TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- 帖子订阅(重点关注的讨论;通知通道后补,先存关系)
CREATE TABLE IF NOT EXISTS post_subscriptions (
  user_id BIGINT UNSIGNED NOT NULL,
  post_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 回帖任务(新帖入库后排队,bot 消费)
CREATE TABLE IF NOT EXISTS ai_reply_jobs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/done/failed/skipped',
  error VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  KEY idx_status (status, created_at),
  CONSTRAINT fk_job_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
