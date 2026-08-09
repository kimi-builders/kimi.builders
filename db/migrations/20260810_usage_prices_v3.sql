-- Phase 2 价格勘误与官方来源补全(2026-08-10)。
-- 可重复执行:UPDATE 同时匹配旧/新版本;新增模型按自然字段 NOT EXISTS。
-- 只修正错误种子,不会用今日价格覆盖其他历史窗口。

UPDATE usage_model_prices
SET output_per_mtok = 180.00,
    version = '2026-08-10',
    note = 'OpenAI 官方价格表 2026-08;修正旧种子 $150;缓存价未公布'
WHERE model_pattern = 'gpt-5.5-pro'
  AND effective_from = '2026-06-01 00:00:00'
  AND version IN ('2026-08-09', '2026-08-10');

UPDATE usage_model_prices
SET cache_read_per_mtok = 0.25,
    version = '2026-08-10',
    note = 'OpenAI 官方价格表 2026-08;补全 cached input'
WHERE model_pattern = 'gpt-5.4'
  AND effective_from = '2026-04-01 00:00:00'
  AND version IN ('2026-08-09', '2026-08-10');

UPDATE usage_model_prices
SET input_per_mtok = 0.50,
    cache_read_per_mtok = 0.05,
    output_per_mtok = 3.00,
    version = '2026-08-10',
    note = 'Google 官方 Standard 价格表 2026-08;修正旧种子的 Batch 价'
WHERE model_pattern = 'gemini-3-flash-preview'
  AND effective_from = '2026-05-01 00:00:00'
  AND version IN ('2026-08-09', '2026-08-10');

INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok,
   reasoning_per_mtok, version, note)
SELECT 'gpt-5.4-mini', 'prefix', NULL, '2026-04-01 00:00:00', NULL, 'USD',
       0.75, NULL, 0.075, 4.50, NULL, '2026-08-10',
       'OpenAI 官方价格表 2026-08'
WHERE NOT EXISTS (
  SELECT 1 FROM usage_model_prices
  WHERE model_pattern = 'gpt-5.4-mini'
    AND source IS NULL
    AND effective_from = '2026-04-01 00:00:00'
);
