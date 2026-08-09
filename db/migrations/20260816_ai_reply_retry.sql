-- AI 回帖自动重试(P0-3):记录执行次数与最近一次开始执行的时间,
-- 供 /api/cron/ai-reply-retry 做指数退避扫描与次数封顶。

ALTER TABLE ai_reply_jobs
  ADD COLUMN attempts INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已执行次数(含手动重跑)' AFTER error,
  ADD COLUMN last_attempt_at DATETIME NULL COMMENT '最近一次开始执行的时间' AFTER attempts;
