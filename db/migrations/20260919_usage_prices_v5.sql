-- 用量价格 v5(20260919):按 opencode 价格快照(2026-08-15,用户提供)补全/更新。
-- 快照口径 = 各厂商标准 API 价;末列 Usage($15/$60)是 opencode 演示用量,与本表无关。
--
-- 新增 16 行(12 个新型号 + qwen plus 双 context 档 + minimax-m3 新窗口):
--   grok-4.5 / glm-5.3 / mimo-v2.5(+pro)/ minimax-m2.7 / minimax-m2.5 /
--   qwen3.8-max / qwen3.7-max / qwen3.7-plus(≤256K=short,>256K=long)/
--   qwen3.6-plus(short/long)/ deepseek-v4-pro / deepseek-v4-flash / hy3
-- 更新 2 处:
--   kimi-k2.6        —— 缓存读价 $0.16 已公布(原行 note「缓存读价未公布」,NULL 会让
--                      缓存读 token 一直标 partial);原地补率,不改历史窗口口径
--   minimax-m3       —— 快照价 $0.30/$1.20 与存量行 $0.60/$2.40(morphllm 2026-06 核)
--                      差 2 倍,按降价处理:旧窗口关到 2026-08-15,新窗口自当日起
--
-- mimo-v2.5 与 mimo-v2.5-pro 前缀互相包含,匹配取最长前缀,pro 行优先命中,安全。
-- mimo 官方价目页未定型,溯源先记 models.dev(opencode 价格上游)。

INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, context_tier, processing_tier,
   effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok,
   reasoning_per_mtok, version, pricing_source_url, verified_at, pricing_basis, note)
SELECT seed.*
FROM (
  SELECT 'grok-4.5' AS model_pattern, 'prefix' AS match_kind, NULL AS source,
         '' AS context_tier, 'standard' AS processing_tier,
         '2026-07-21 00:00:00' AS effective_from, NULL AS effective_to, 'USD' AS currency,
         2.00 AS input_per_mtok, NULL AS cache_write_per_mtok,
         0.30 AS cache_read_per_mtok, 6.00 AS output_per_mtok,
         NULL AS reasoning_per_mtok, '2026-08-15' AS version,
         'https://x.ai/api' AS pricing_source_url, '2026-08-15' AS verified_at,
         'standard-api' AS pricing_basis,
         'xAI 官方价;缓存读 2026-07-21 由 $0.50 降至 $0.30,取降价后窗口' AS note
  UNION ALL
  SELECT 'glm-5.3', 'prefix', NULL, '', 'standard',
         '2026-07-01 00:00:00', NULL, 'USD',
         1.40, NULL, 0.26, 4.40, NULL, '2026-08-15',
         'https://docs.z.ai/guides/overview/pricing', '2026-08-15', 'standard-api',
         'Z.ai 官方价;与 glm-5.1/5.2 同档'
  UNION ALL
  SELECT 'mimo-v2.5', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.14, NULL, 0.0028, 0.28, NULL, '2026-08-15',
         'https://models.dev/', '2026-08-15', 'standard-api',
         'Xiaomi MiMo 官方价(models.dev 快照);前缀含 pro,最长前缀优先命中'
  UNION ALL
  SELECT 'mimo-v2.5-pro', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.435, NULL, 0.003625, 0.87, NULL, '2026-08-15',
         'https://models.dev/', '2026-08-15', 'standard-api',
         'Xiaomi MiMo 官方价(models.dev 快照)'
  UNION ALL
  SELECT 'minimax-m2.7', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.30, 0.375, 0.06, 1.20, NULL, '2026-08-15',
         'https://platform.minimax.io/docs/guides/pricing-paygo', '2026-08-15', 'standard-api',
         'MiniMax 官方价(2026-08-15 快照)'
  UNION ALL
  SELECT 'minimax-m2.5', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.30, 0.375, 0.06, 1.20, NULL, '2026-08-15',
         'https://platform.minimax.io/docs/guides/pricing-paygo', '2026-08-15', 'standard-api',
         'MiniMax 官方价(2026-08-15 快照)'
  UNION ALL
  SELECT 'minimax-m3', 'prefix', NULL, '', 'standard',
         '2026-08-15 00:00:00', NULL, 'USD',
         0.30, NULL, 0.06, 1.20, NULL, '2026-08-15',
         'https://platform.minimax.io/docs/guides/pricing-paygo', '2026-08-15', 'standard-api',
         'MiniMax 2026-08-15 快照价;较 2026-06 核价($0.60/$2.40)减半,见旧窗口'
  UNION ALL
  SELECT 'qwen3.8-max', 'prefix', NULL, '', 'standard',
         '2026-07-01 00:00:00', NULL, 'USD',
         2.00, 2.50, 0.25, 6.00, NULL, '2026-08-15',
         'https://help.aliyun.com/zh/model-studio/model-pricing', '2026-08-15', 'standard-api',
         '阿里云百炼官方价(2026-08-15 快照)'
  UNION ALL
  SELECT 'qwen3.7-max', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         2.50, 3.125, 0.50, 7.50, NULL, '2026-08-15',
         'https://help.aliyun.com/zh/model-studio/model-pricing', '2026-08-15', 'standard-api',
         '阿里云百炼官方价(2026-08-15 快照)'
  UNION ALL
  SELECT 'qwen3.7-plus', 'prefix', NULL, 'short', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.40, 0.50, 0.04, 1.60, NULL, '2026-08-15',
         'https://help.aliyun.com/zh/model-studio/model-pricing', '2026-08-15', 'standard-api',
         '阿里云百炼官方价;≤256K 档'
  UNION ALL
  SELECT 'qwen3.7-plus', 'prefix', NULL, 'long', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         1.20, 1.50, 0.12, 4.80, NULL, '2026-08-15',
         'https://help.aliyun.com/zh/model-studio/model-pricing', '2026-08-15', 'standard-api',
         '阿里云百炼官方价;>256K 档'
  UNION ALL
  SELECT 'qwen3.6-plus', 'prefix', NULL, 'short', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.50, 0.625, 0.05, 3.00, NULL, '2026-08-15',
         'https://help.aliyun.com/zh/model-studio/model-pricing', '2026-08-15', 'standard-api',
         '阿里云百炼官方价;≤256K 档'
  UNION ALL
  SELECT 'qwen3.6-plus', 'prefix', NULL, 'long', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         2.00, 2.50, 0.20, 6.00, NULL, '2026-08-15',
         'https://help.aliyun.com/zh/model-studio/model-pricing', '2026-08-15', 'standard-api',
         '阿里云百炼官方价;>256K 档'
  UNION ALL
  SELECT 'deepseek-v4-pro', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.435, NULL, 0.003625, 0.87, NULL, '2026-08-15',
         'https://api-docs.deepseek.com/quick_start/pricing', '2026-08-15', 'standard-api',
         'DeepSeek 官方价(2026-08-15 快照)'
  UNION ALL
  SELECT 'deepseek-v4-flash', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.14, NULL, 0.0028, 0.28, NULL, '2026-08-15',
         'https://api-docs.deepseek.com/quick_start/pricing', '2026-08-15', 'standard-api',
         'DeepSeek 官方价(2026-08-15 快照)'
  UNION ALL
  SELECT 'hy3', 'prefix', NULL, '', 'standard',
         '2026-06-01 00:00:00', NULL, 'USD',
         0.14, NULL, 0.035, 0.58, NULL, '2026-08-15',
         'https://cloud.tencent.com/document/product/1729', '2026-08-15', 'standard-api',
         '腾讯混元官方价(2026-08-15 快照)'
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

-- kimi-k2.6 缓存读价补全($0.16,2026-08-15 快照):原地补率,IS NULL 守卫保证幂等
UPDATE usage_model_prices
SET cache_read_per_mtok = 0.16,
    version = '2026-08-15',
    verified_at = '2026-08-15',
    note = 'Moonshot platform 2026-08;缓存读价 $0.16 已公布(2026-08-15 快照补录)'
WHERE model_pattern = 'kimi-k2.6'
  AND cache_read_per_mtok IS NULL;

-- minimax-m3 旧窗口($0.60/$2.40,morphllm 2026-06 核)关窗,让位 2026-08-15 快照价。
-- 注意必须用 effective_from 限定旧行:新窗口行此时也是 effective_to IS NULL,
-- 不带这个条件会把新行一起关掉(20260919 修复)
UPDATE usage_model_prices
SET effective_to = '2026-08-15 00:00:00',
    note = CONCAT(note, ';2026-08-15 起官方价减半,窗口关闭(见新行)')
WHERE model_pattern = 'minimax-m3'
  AND effective_from = '2026-05-01 00:00:00'
  AND effective_to IS NULL;
