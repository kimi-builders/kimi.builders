-- 纠正 20260919_usage_prices_v5 的关窗误判:初版 UPDATE 只按
-- 「minimax-m3 + effective_to IS NULL」匹配,把刚插入的 2026-08-15 新窗口行
-- 也一并关掉了([08-15, 08-15) 空窗,m3 新价永不生效)。
-- v5 文件本身已修(加 effective_from 限定);本迁移修复已应用过初版的库:
-- 把新窗口行重新打开并还原 note。全新库上 v5 修正版不会制造这个状态,
-- 本迁移自然空转(WHERE 不匹配)。

UPDATE usage_model_prices
SET effective_to = NULL,
    note = 'MiniMax 2026-08-15 快照价;较 2026-06 核价($0.60/$2.40)减半,见旧窗口'
WHERE model_pattern = 'minimax-m3'
  AND effective_from = '2026-08-15 00:00:00'
  AND effective_to IS NOT NULL;
