-- Usage dashboard query indexes.
-- Deploy before the matching site version. Collector payloads are unchanged.

ALTER TABLE usage_buckets
  ADD KEY idx_usage_bucket_project_time (user_id, project_label, bucket_start);

ALTER TABLE usage_sessions
  ADD KEY idx_usage_session_user_overlap (user_id, last_message_at, first_message_at),
  ADD KEY idx_usage_session_agent_overlap
    (user_id, agent_version, last_message_at, first_message_at);
