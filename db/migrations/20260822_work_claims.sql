-- 作品用量声明制(2026-08):作品徽章从「作者总量」改为「作者声明 + 系统按可验证总量封顶」。
-- 总量机器验证:作者可验证总量 = usage_buckets 全时间 token SUM(系统内部口径,
--   不做 show_on_leaderboard opt-in 门禁 —— 作者为自己的作品声明投入,该行为本身即公开授权)。
-- 分配作者定夺:同一作者全部未删作品的 claimed_tokens 之和 ≤ 可验证总量,写时校验
--   (编辑时排除本作品),超额拒绝并告知剩余可声明额度;删除作品自然释放额度(物理删除)。
-- 展示时兜底:作者总量缩水(删数据/retention)使 Σ声明 > 总量时,该作者所有作品徽章
--   整体不渲染(无负面标记),作者在作品列表/编辑页看到重新分配提示(仅作者可见)。

ALTER TABLE works
  ADD COLUMN claimed_tokens BIGINT UNSIGNED NULL COMMENT '作者声明的该作品构建投入 tokens;NULL=未声明(声明制:同作者 Σ声明 ≤ 可验证总量)';
