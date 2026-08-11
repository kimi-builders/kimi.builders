-- 作品元数据扩展(2026-08,作品+Awesome 改造):
--   status          作品状态:planning 策划中 / building 开发中 / released 已发布(默认) / archived 停止维护
--   models          开发模型 JSON 列表(家族级预设键如 kimi/claude/openai,或自填具体型号文本)
--   platforms       应用平台 JSON 键列表:website/miniapp/cli/ios/android/desktop
--   description_md  作品描述(Markdown,详情页渲染;NULL = 用 tagline 占位)
--   scope           Awesome 收录口径:base 以 Kimi 为基座 / eco 为 Kimi 生态 / part Kimi 参与构建;
--                   仅 source='awesome' 条目(推荐时表单必填,服务端校验),作品墙条目恒 NULL

ALTER TABLE works
  ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'released' COMMENT 'planning/building/released/archived',
  ADD COLUMN models JSON NULL COMMENT '开发模型(家族键或自填型号文本)',
  ADD COLUMN platforms JSON NULL COMMENT '应用平台键列表(website/miniapp/cli/ios/android/desktop)',
  ADD COLUMN description_md TEXT NULL COMMENT '作品描述(Markdown);NULL 时详情页用 tagline',
  ADD COLUMN scope VARCHAR(16) NULL COMMENT 'Awesome 收录口径:base/eco/part;仅 awesome 条目';
