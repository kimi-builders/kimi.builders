-- 社区治理(2026-08,管理后台 /admin):
--   1) 屏蔽(hide):posts / comments / works 加 hidden_at/hidden_by/hidden_reason。
--      屏蔽 ≠ 软删:是管理员对公开可见性的处置 —— 公开侧(列表/详情/搜索/右栏/
--      海报/精选)一律不可见;作者本人仍可见,带「已被管理员屏蔽」标注;可解除。
--   2) 禁言:users.muted_until(到期自动解除;永久 = 9999-12-31 哨兵)。
--   3) 审计:moderation_actions,所有治理动作必写(actor/action/target/reason)。
-- 硬删除不加列:仅 admin,物理 DELETE(评论/投票等靠既有 ON DELETE CASCADE 收敛)。

ALTER TABLE posts
  ADD COLUMN hidden_at DATETIME NULL COMMENT '屏蔽时间;NULL=未屏蔽(治理:公开侧不可见,作者可见带标注)' AFTER deleted_at,
  ADD COLUMN hidden_by BIGINT UNSIGNED NULL COMMENT '执行屏蔽的管理员 users.id' AFTER hidden_at,
  ADD COLUMN hidden_reason VARCHAR(280) NULL COMMENT '屏蔽原因(展示给作者/管理面)' AFTER hidden_by,
  ADD KEY idx_hidden (hidden_at),
  ADD CONSTRAINT fk_post_hidden FOREIGN KEY (hidden_by) REFERENCES users (id);

ALTER TABLE comments
  ADD COLUMN hidden_at DATETIME NULL COMMENT '屏蔽时间;NULL=未屏蔽' AFTER deleted_at,
  ADD COLUMN hidden_by BIGINT UNSIGNED NULL COMMENT '执行屏蔽的管理员 users.id' AFTER hidden_at,
  ADD COLUMN hidden_reason VARCHAR(280) NULL COMMENT '屏蔽原因' AFTER hidden_by,
  ADD CONSTRAINT fk_comment_hidden FOREIGN KEY (hidden_by) REFERENCES users (id);

ALTER TABLE works
  ADD COLUMN hidden_at DATETIME NULL COMMENT '屏蔽时间;NULL=未屏蔽' AFTER visibility,
  ADD COLUMN hidden_by BIGINT UNSIGNED NULL COMMENT '执行屏蔽的管理员 users.id' AFTER hidden_at,
  ADD COLUMN hidden_reason VARCHAR(280) NULL COMMENT '屏蔽原因' AFTER hidden_by,
  ADD KEY idx_hidden (hidden_at),
  ADD CONSTRAINT fk_work_hidden FOREIGN KEY (hidden_by) REFERENCES users (id);

ALTER TABLE users
  ADD COLUMN muted_until DATETIME NULL COMMENT '禁言截止;NULL=未禁言,9999-12-31=永久;到期自动解除' AFTER role;

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
