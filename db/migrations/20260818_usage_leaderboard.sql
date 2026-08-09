-- P1-1 社区用量榜:自愿公开开关。默认 deny(0),用户主动 opt-in 才公开其**聚合**用量
-- (社区榜 / 个人主页热力图 / 作品徽章共用此开关)。公开的只有周期聚合 token 与活跃天数,
-- 不含项目名、设备、时段等任何明细维度。

ALTER TABLE usage_settings
  ADD COLUMN show_on_leaderboard TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '自愿公开聚合用量(社区榜/热力图/作品徽章);1=公开,0=不公开(默认)'
    AFTER retention_days;
