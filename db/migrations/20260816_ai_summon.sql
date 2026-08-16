-- AI 召唤(@kimi)PR1:ai_reply_jobs 泛化。
-- kind 区分任务类型(auto=回帖 chain=接话 mention=召唤);
-- post_id 放宽 NULL 并新增 work 目标列(PR2 作品召唤用,PR1 不写)。
-- 幂等由 runner 账本 + dup 错误收编(见 docs/db-migrate.md)。

ALTER TABLE ai_reply_jobs
  ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'auto' COMMENT 'auto=回帖 chain=接话 mention=召唤',
  ADD COLUMN work_id BIGINT UNSIGNED NULL COMMENT '作品召唤目标(post 任务为 NULL)',
  ADD COLUMN work_comment_id BIGINT UNSIGNED NULL COMMENT '触发召唤的作品评论',
  MODIFY COLUMN post_id BIGINT UNSIGNED NULL;

ALTER TABLE ai_reply_jobs
  ADD CONSTRAINT fk_job_work FOREIGN KEY (work_id) REFERENCES works (id) ON DELETE CASCADE;
