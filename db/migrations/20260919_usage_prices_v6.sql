-- 用量价格 v6(20260919):第二批 2026-08-15 快照(用户提供)。
-- 新增 9 行:
--   gemini-3.1-pro-preview(short ≤200K / long >200K 双档,长上下文涨价)
--   gemini-3.5-flash / gemini-3.6-flash / gemini-3.7-flash
--     (3.6/3.7 为 2026 年底前优惠价;不预设 effective_to,涨价官宣后再开新窗口)
--   grok-4.5 short + long / grok-4.6 short + long
-- 调整 1 处:
--   grok-4.5 v5 录入时只有短档、context_tier 留空;有了长档价后改为显式 short 档
--   ——无 tier 信息的历史 bucket 按 short 档估算并标 short-context 假设
--   (estimateCostMicros 既有口径),不再静默无档。
--   实现用「删 '' 行 + 插 short 行」而不是 UPDATE:UPDATE 会把 v5 INSERT 的
--   幂等键(context_tier='')改掉,测试重放 v5 时每轮重复插一行(20260919 实测);
--   DELETE 让重放收敛:v5 重放插回的 '' 行在本迁移里每轮被重新删掉。

DELETE FROM usage_model_prices
WHERE model_pattern = 'grok-4.5'
  AND context_tier = '';

INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, context_tier, processing_tier,
   effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok,
   reasoning_per_mtok, version, pricing_source_url, verified_at, pricing_basis, note)
SELECT seed.*
FROM (
  SELECT 'grok-4.5' AS model_pattern, 'prefix' AS match_kind, NULL AS source,
         'short' AS context_tier, 'standard' AS processing_tier,
         '2026-07-21 00:00:00' AS effective_from, NULL AS effective_to, 'USD' AS currency,
         2.00 AS input_per_mtok, NULL AS cache_write_per_mtok,
         0.30 AS cache_read_per_mtok, 6.00 AS output_per_mtok,
         NULL AS reasoning_per_mtok, '2026-08-15' AS version,
         'https://x.ai/api' AS pricing_source_url, '2026-08-15' AS verified_at,
         'standard-api' AS pricing_basis,
         'xAI 官方价;<200K 档,缓存读 2026-07-21 由 $0.50 降至 $0.30' AS note
  UNION ALL
  SELECT 'grok-4.5', 'prefix', NULL, 'long', 'standard',
         '2026-07-21 00:00:00' AS effective_from, NULL AS effective_to, 'USD' AS currency,
         4.00 AS input_per_mtok, NULL AS cache_write_per_mtok,
         0.60 AS cache_read_per_mtok, 12.00 AS output_per_mtok,
         NULL AS reasoning_per_mtok, '2026-08-15' AS version,
         'https://x.ai/api' AS pricing_source_url, '2026-08-15' AS verified_at,
         'standard-api' AS pricing_basis,
         'xAI 官方价;≥200K 长上下文档' AS note
  UNION ALL
  SELECT 'grok-4.6', 'prefix', NULL, 'short', 'standard',
         '2026-08-01 00:00:00', NULL, 'USD',
         2.00, NULL, 0.50, 6.00, NULL, '2026-08-15',
         'https://x.ai/api', '2026-08-15', 'standard-api',
         'xAI 官方价;<200K 档'
  UNION ALL
  SELECT 'grok-4.6', 'prefix', NULL, 'long', 'standard',
         '2026-08-01 00:00:00', NULL, 'USD',
         4.00, NULL, 1.00, 12.00, NULL, '2026-08-15',
         'https://x.ai/api', '2026-08-15', 'standard-api',
         'xAI 官方价;≥200K 长上下文档'
  UNION ALL
  SELECT 'gemini-3.1-pro-preview', 'prefix', NULL, 'short', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         2.00, NULL, 0.20, 12.00, NULL, '2026-08-15',
         'https://ai.google.dev/gemini-api/docs/pricing', '2026-08-15', 'standard-api',
         'Google 官方价;≤200K prompt 档'
  UNION ALL
  SELECT 'gemini-3.1-pro-preview', 'prefix', NULL, 'long', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         4.00, NULL, 0.40, 18.00, NULL, '2026-08-15',
         'https://ai.google.dev/gemini-api/docs/pricing', '2026-08-15', 'standard-api',
         'Google 官方价;>200K 长上下文涨价档'
  UNION ALL
  SELECT 'gemini-3.5-flash', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         1.50, NULL, 0.15, 9.00, NULL, '2026-08-15',
         'https://ai.google.dev/gemini-api/docs/pricing', '2026-08-15', 'standard-api',
         'Google 官方价;thinking tokens 计入输出(reasoning 回退 output 价,既有口径)'
  UNION ALL
  SELECT 'gemini-3.6-flash', 'prefix', NULL, '', 'standard',
         '2026-07-01 00:00:00', NULL, 'USD',
         0.75, NULL, 0.075, 3.75, NULL, '2026-08-15',
         'https://ai.google.dev/gemini-api/docs/pricing', '2026-08-15', 'standard-api',
         'Google 官方价;2026 年底前优惠价,涨价官宣后开新窗口'
  UNION ALL
  SELECT 'gemini-3.7-flash', 'prefix', NULL, '', 'standard',
         '2026-08-01 00:00:00', NULL, 'USD',
         0.75, NULL, 0.075, 3.75, NULL, '2026-08-15',
         'https://ai.google.dev/gemini-api/docs/pricing', '2026-08-15', 'standard-api',
         'Google 官方价;2026 年底前优惠价,涨价官宣后开新窗口'
) AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM usage_model_prices existing
  WHERE existing.model_pattern = seed.model_pattern
    AND existing.match_kind = seed.match_kind
    AND existing.source <=> seed.source
    AND existing.context_tier = seed.context_tier
    AND existing.effective_from = seed.effective_from
);
