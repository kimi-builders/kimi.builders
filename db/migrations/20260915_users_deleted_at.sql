-- 账号注销(B3):软注销——置位 deleted_at 即禁登,资料脱敏,内容保留(FK 完整)。
-- 登录侧三处过滤(getSessionUser / findEmailAccount / OAuth 回调),
-- 注销后 handle 改写为 deleted-<id>(释放原 handle 的视觉占用,保持唯一)。

ALTER TABLE users
  ADD COLUMN deleted_at DATETIME NULL COMMENT '注销时间;NULL=正常,置位=禁登+脱敏';
