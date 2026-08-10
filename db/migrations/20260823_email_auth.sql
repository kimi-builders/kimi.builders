-- 邮箱注册/登录(P1 补全):users 增加密码散列与邮箱验证时间。
-- v0 不发验证邮件(无邮件通道):email_verified_at 预留,注册即可用;
-- 找回密码走管理员 SQL 运维,接邮件服务后补自助流程。

ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(190) NULL COMMENT 'scrypt$N$r$p$salt$hash;NULL=未设密码(OAuth 用户)',
  ADD COLUMN email_verified_at DATETIME NULL COMMENT '邮箱验证时间;NULL=未验证(v0 预留)';
