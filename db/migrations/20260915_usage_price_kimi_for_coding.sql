-- kimi-for-coding 价格补录(20260915):Kimi Code 订阅日志里的内部模型名,
-- 公开价格表没有同名条目;按 kimi-k2.7-code 标准 API 价估算
-- (Moonshot platform 2026-07 价目:输入 $0.95 / 缓存读 $0.19 / 输出 $4.00 每 Mtok,
-- 缓存写未公布保持 NULL,由服务端规则回退普通 input 价)。
-- 订阅费与 API 计量不同价,这只是估算口径——站内展示本就标注「按标准 API 价估算」。
INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok,
   reasoning_per_mtok, version, note)
SELECT 'kimi-for-coding', 'prefix', NULL, '2026-06-01 00:00:00', NULL, 'USD',
       0.95, NULL, 0.19, 4.00, NULL, '2026-09-15',
       'Kimi Code 订阅内部模型名;按 kimi-k2.7-code 标准 API 价估算'
WHERE NOT EXISTS (
  SELECT 1 FROM usage_model_prices
  WHERE model_pattern = 'kimi-for-coding' AND match_kind = 'prefix'
    AND source IS NULL AND effective_from = '2026-06-01 00:00:00'
);
