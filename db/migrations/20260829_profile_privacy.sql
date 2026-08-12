-- 资料字段级隐私(2026-08,设置「隐私与公开」的「资料展示」区):
--   profile_show_avatar / profile_show_name / profile_show_bio
--   1=公开(默认,存量行为不变),0=仅自己。
-- 生效范围仅个人主页 /u/[handle]:头像隐藏→首字符兜底;显示名隐藏→只显示
-- @handle;简介隐藏→简介区不渲染。帖子/评论区的头像昵称是公开发言标识,不受影响。
-- 存 users 表列,与 ai_replies_enabled / show_ai_replies 同一模式。

ALTER TABLE users
  ADD COLUMN profile_show_avatar TINYINT(1) NOT NULL DEFAULT 1 COMMENT '个人主页展示头像;0=仅自己' AFTER bio,
  ADD COLUMN profile_show_name TINYINT(1) NOT NULL DEFAULT 1 COMMENT '个人主页展示显示名;0=仅显示 @handle' AFTER profile_show_avatar,
  ADD COLUMN profile_show_bio TINYINT(1) NOT NULL DEFAULT 1 COMMENT '个人主页展示简介;0=仅自己' AFTER profile_show_name;
