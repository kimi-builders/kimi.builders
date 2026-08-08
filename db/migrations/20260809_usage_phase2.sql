-- kimi.builders 用量 Phase 2:服务端版本化模型价格表
-- 幂等:CREATE TABLE IF NOT EXISTS + 种子按 version 去重,可重复执行。
-- 兼容 Phase 1:不改 usage_buckets/usage_sessions 任何既有语义;
-- usage_buckets.cost_micros 继续只承载 legacy v1 迁入值,Phase 2 估费在查询时按本表计算。

CREATE TABLE IF NOT EXISTS usage_model_prices (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  model_pattern VARCHAR(120) NOT NULL COMMENT '模型 ID;match_kind=exact 时全等,prefix 时前缀匹配(最长前缀优先)',
  match_kind VARCHAR(8) NOT NULL DEFAULT 'prefix' COMMENT 'exact|prefix',
  source VARCHAR(40) NULL COMMENT '保留:限定来源工具;NULL=按模型 ID 跨来源匹配(默认,模型定价与工具无关)',
  effective_from DATETIME(3) NOT NULL COMMENT 'UTC,生效起点(含)',
  effective_to DATETIME(3) NULL COMMENT 'UTC,生效终点(不含);NULL=至今有效',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  input_per_mtok DECIMAL(18,6) NOT NULL COMMENT '美元/百万 input token',
  cache_write_per_mtok DECIMAL(18,6) NULL COMMENT 'NULL=按 input 价(Moonshot/OpenAI 语义;Anthropic 单列)',
  cache_read_per_mtok DECIMAL(18,6) NULL COMMENT 'NULL=该类目未定价:对应 token 保留但不计入估费,模型记为 partial',
  output_per_mtok DECIMAL(18,6) NOT NULL COMMENT '美元/百万 output token',
  reasoning_per_mtok DECIMAL(18,6) NULL COMMENT 'NULL=按 output 价(OpenAI/Moonshot 把 reasoning 计入 output 计费)',
  version VARCHAR(40) NOT NULL COMMENT '价格表版本,估费结果可回溯到它',
  note VARCHAR(200) NOT NULL DEFAULT '' COMMENT '来源与备注',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_prices_window (effective_from, effective_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 种子版本 2026-08-08。来源:
--   Anthropic 官方 claude.com/pricing(2026-08 抓取):Fable 5 / Opus 5 / Sonnet 5(含 2026-08-31 后恢复标价)/ Haiku 4.5 / Opus 4.x / Sonnet 4.x / Opus 4.1
--   Moonshot 平台价(2026-07-16,经 morphllm.com/kimi-api 汇总 platform 价目):kimi-k3 / k2.7-code / k2.6 / k2.5;k2-thinking 系与初代 k2 为 cloudprice/apidog 汇总价
--   OpenAI 标价(arXiv 2602.12670 2026-02 核价表 + pricepertoken/BenchLM/OpenRouter 汇总):gpt-5.2 系 / gpt-5.1 系 / gpt-5 系 / codex-mini
-- Moonshot/OpenAI 不单独收 cache write(=input 价,NULL 走回退);reasoning 计入 output(NULL 走回退)。
-- 未收录模型(如 gpt-5.1-codex-max 来源互相矛盾)保持未定价:token 照常统计,费用不计。
INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok, reasoning_per_mtok,
   version, note)
SELECT * FROM (
  SELECT 'kimi-k3' AS model_pattern, 'prefix' AS match_kind, NULL AS source,
         '2026-07-16 00:00:00' AS effective_from, NULL AS effective_to, 'USD' AS currency,
         3.00 AS input_per_mtok, NULL AS cache_write_per_mtok, 0.30 AS cache_read_per_mtok,
         15.00 AS output_per_mtok, NULL AS reasoning_per_mtok,
         '2026-08-08' AS version, 'Moonshot platform 2026-07' AS note UNION ALL
  SELECT 'kimi-k2.7-code'       , 'prefix', NULL, '2026-06-01 00:00:00', NULL,              'USD',  0.95, NULL,  0.19,  4.00, NULL, '2026-08-08', 'Moonshot platform 2026-07' UNION ALL
  SELECT 'kimi-k2.6'            , 'prefix', NULL, '2026-06-01 00:00:00', NULL,              'USD',  0.95, NULL,  NULL,  4.00, NULL, '2026-08-08', 'Moonshot platform 2026-07;缓存读价未公布' UNION ALL
  SELECT 'kimi-k2.5'            , 'prefix', NULL, '2026-06-01 00:00:00', NULL,              'USD',  0.60, NULL,  NULL,  3.00, NULL, '2026-08-08', 'Moonshot platform 2026-07;缓存读价未公布' UNION ALL
  SELECT 'kimi-k2-thinking-turbo','prefix', NULL, '2025-11-06 00:00:00', NULL,              'USD',  1.15, NULL,  NULL,  8.00, NULL, '2026-08-08', 'Moonshot 汇总价(cloudprice 2026-05)' UNION ALL
  SELECT 'kimi-k2-thinking'     , 'prefix', NULL, '2025-11-06 00:00:00', NULL,              'USD',  1.15, NULL,  NULL,  8.00, NULL, '2026-08-08', 'Moonshot 汇总价(cloudprice 2026-05)' UNION ALL
  SELECT 'kimi-k2-turbo'        , 'prefix', NULL, '2025-08-01 00:00:00', NULL,              'USD',  1.15, NULL,  NULL,  8.00, NULL, '2026-08-08', 'Moonshot 汇总价(futureagi 2026-06)' UNION ALL
  SELECT 'kimi-k2'              , 'prefix', NULL, '2025-07-11 00:00:00', '2026-05-25 00:00:00','USD',0.60, NULL,  0.15,  2.50, NULL, '2026-08-08', '初代 k2,2026-05-25 下线;窗口外按 unpriced' UNION ALL
  SELECT 'claude-fable-5'       , 'prefix', NULL, '2026-06-01 00:00:00', NULL,              'USD', 10.00, 12.50, 1.00, 50.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08' UNION ALL
  SELECT 'claude-opus-5'        , 'prefix', NULL, '2026-06-01 00:00:00', NULL,              'USD',  5.00,  6.25, 0.50, 25.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08' UNION ALL
  SELECT 'claude-sonnet-5'      , 'prefix', NULL, '2026-06-01 00:00:00', '2026-09-01 00:00:00','USD',2.00,  2.50, 0.20, 10.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08;体验价至 2026-08-31' UNION ALL
  SELECT 'claude-sonnet-5'      , 'prefix', NULL, '2026-09-01 00:00:00', NULL,              'USD',  3.00,  3.75, 0.30, 15.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08;标准价自 2026-09-01' UNION ALL
  SELECT 'claude-haiku-4-5'     , 'prefix', NULL, '2025-10-01 00:00:00', NULL,              'USD',  1.00,  1.25, 0.10,  5.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08' UNION ALL
  SELECT 'claude-opus-4-1'      , 'prefix', NULL, '2025-08-05 00:00:00', NULL,              'USD', 15.00, 18.75, 1.50, 75.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08(legacy)' UNION ALL
  SELECT 'claude-opus-4'        , 'prefix', NULL, '2025-05-01 00:00:00', NULL,              'USD',  5.00,  6.25, 0.50, 25.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08(4.5-4.8)' UNION ALL
  SELECT 'claude-sonnet-4'      , 'prefix', NULL, '2025-05-01 00:00:00', NULL,              'USD',  3.00,  3.75, 0.30, 15.00, NULL, '2026-08-08', 'claude.com/pricing 2026-08(4.5/4.6)' UNION ALL
  SELECT 'gpt-5.2-codex'        , 'prefix', NULL, '2026-02-01 00:00:00', NULL,              'USD',  1.75, NULL, 0.175, 14.00, NULL, '2026-08-08', 'OpenAI 标价(arXiv 2602.12670 核价 2026-02)' UNION ALL
  SELECT 'gpt-5.2'              , 'prefix', NULL, '2026-02-01 00:00:00', NULL,              'USD',  1.75, NULL, 0.175, 14.00, NULL, '2026-08-08', 'OpenAI 标价(arXiv 2602.12670 核价 2026-02)' UNION ALL
  SELECT 'gpt-5.1-codex-mini'   , 'prefix', NULL, '2026-02-01 00:00:00', NULL,              'USD',  0.25, NULL,  NULL,  2.00, NULL, '2026-08-08', 'OpenAI 标价(OpenRouter 2026-05);缓存读价未公布' UNION ALL
  SELECT 'gpt-5.1-codex'        , 'prefix', NULL, '2026-02-01 00:00:00', NULL,              'USD',  1.25, NULL, 0.125, 10.00, NULL, '2026-08-08', 'OpenAI 标价(BenchLM 2026-07)' UNION ALL
  SELECT 'gpt-5.1'              , 'prefix', NULL, '2026-02-01 00:00:00', NULL,              'USD',  1.25, NULL, 0.125, 10.00, NULL, '2026-08-08', 'OpenAI 标价(BenchLM 2026-05)' UNION ALL
  SELECT 'gpt-5-codex'          , 'prefix', NULL, '2025-09-15 00:00:00', NULL,              'USD',  1.25, NULL, 0.125, 10.00, NULL, '2026-08-08', 'OpenAI 标价' UNION ALL
  SELECT 'gpt-5'                , 'prefix', NULL, '2025-08-07 00:00:00', NULL,              'USD',  1.25, NULL, 0.125, 10.00, NULL, '2026-08-08', 'OpenAI 标价' UNION ALL
  SELECT 'codex-mini'           , 'prefix', NULL, '2025-05-16 00:00:00', NULL,              'USD',  1.50, NULL, 0.375,  6.00, NULL, '2026-08-08', 'OpenAI 标价'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM usage_model_prices WHERE version = '2026-08-08' LIMIT 1
);
