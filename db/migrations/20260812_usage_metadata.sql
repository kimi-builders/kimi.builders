-- 用量请求/设备元数据扩展。
-- 部署顺序:先执行本迁移,再部署服务端,最后更新 Collector。
-- 空字符串代表日志没有提供该事实；不得用当前版本回填历史请求。

ALTER TABLE usage_devices
  ADD COLUMN terminal_name VARCHAR(60) NOT NULL DEFAULT '' AFTER parser_version,
  ADD COLUMN terminal_version VARCHAR(80) NOT NULL DEFAULT '' AFTER terminal_name,
  ADD COLUMN os_name VARCHAR(40) NOT NULL DEFAULT '' AFTER terminal_version,
  ADD COLUMN os_version VARCHAR(60) NOT NULL DEFAULT '' AFTER os_name,
  ADD COLUMN architecture VARCHAR(24) NOT NULL DEFAULT '' AFTER os_version,
  ADD COLUMN agent_versions JSON NULL AFTER architecture;

ALTER TABLE usage_buckets
  DROP INDEX uq_usage_bucket,
  ADD COLUMN model_canonical VARCHAR(160) NOT NULL DEFAULT '' AFTER model,
  ADD COLUMN model_provider VARCHAR(80) NOT NULL DEFAULT '' AFTER model_canonical,
  ADD COLUMN reasoning_effort VARCHAR(32) NOT NULL DEFAULT '' AFTER model_provider,
  ADD COLUMN agent_version VARCHAR(80) NOT NULL DEFAULT '' AFTER reasoning_effort,
  ADD UNIQUE KEY uq_usage_bucket
    (user_id, device_id, source, model, model_provider, reasoning_effort,
     agent_version, project_hash, bucket_start),
  ADD KEY idx_usage_bucket_effort_time (user_id, reasoning_effort, bucket_start),
  ADD KEY idx_usage_bucket_agent_time (user_id, agent_version, bucket_start);

ALTER TABLE usage_sessions
  ADD COLUMN agent_version VARCHAR(80) NOT NULL DEFAULT '' AFTER source;
