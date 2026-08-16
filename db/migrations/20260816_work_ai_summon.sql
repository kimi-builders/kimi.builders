-- AI 召唤(@kimi)PR2:作品/Awesome 评论区召唤。
-- works.ai_reply = 内容级开关(同 posts.ai_reply,默认开);
-- work_comments 放行 AI 评论(user_id 放宽 NULL + is_ai);
-- notifications 加 work 目标列(work 通知不绑帖子,post_id/comment_id 随之放宽 NULL)。
-- 幂等由 runner 账本 + dup 错误收编(见 docs/db-migrate.md)。

ALTER TABLE works
  ADD COLUMN ai_reply TINYINT(1) NOT NULL DEFAULT 1 COMMENT '允许 AI 参与本作品评论区(@kimi 召唤)';

ALTER TABLE work_comments
  MODIFY COLUMN user_id BIGINT UNSIGNED NULL COMMENT '评论作者;NULL=AI',
  ADD COLUMN is_ai TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE notifications
  MODIFY COLUMN post_id BIGINT UNSIGNED NULL,
  MODIFY COLUMN comment_id BIGINT UNSIGNED NULL COMMENT '触达锚点 /community/<post>#comment-<id>',
  ADD COLUMN work_id BIGINT UNSIGNED NULL COMMENT '作品通知目标(post 通知为 NULL)',
  ADD COLUMN work_comment_id BIGINT UNSIGNED NULL COMMENT '作品评论锚点 /works/<id>#work-comment-<cid>';
