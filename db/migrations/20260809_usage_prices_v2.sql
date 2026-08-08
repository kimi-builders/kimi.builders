-- 价格表种子 v2(2026-08-09):按首个真实用户(站长)生产数据补全。
-- 幂等:按 version 去重,可重复执行;只新增行,不改 2026-08-08 行。
-- 依据(来源见 note):
--   kimi-code/k3、裸 k3:Kimi Code/渠道日志的 provider 前缀与裸 slug 形态 → kimi-k3 同价
--   gpt-5.5 $5/$30 缓存 $0.50(glbgpt 2026-08);gpt-5.5-pro $30/$150(CloudZero 2026-07)
--   gpt-5.4 $2.50/$15(pricepertoken 2026-08);gpt-5.3-codex $1.75/$14(OpenAI 社区/llm-stats 2026-07)
--   glm-5.1/5.2 $1.40/$4.40 缓存 $0.26(Z.ai 官方表, tokencost/layer3labs 2026-08)
--   minimax-m3 $0.60/$2.40(morphllm 2026-06)
--   gemini-3-flash $0.50/$3.00、gemini-3-flash-preview $0.25/$1.50(lumichats/pricepertoken 2026-08)
-- 仍无可靠公开价、保持未定价(token 照算):gpt-5.6-sol/terra、gpt-5.4-mini、
--   deepseek-v4-pro、qwen3.7-max、gemini-3.5-flash、codex-auto-review、kimi-for-coding(订阅制)。
INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok, reasoning_per_mtok,
   version, note)
SELECT * FROM (
  SELECT 'kimi-code/k3' AS model_pattern, 'prefix' AS match_kind, NULL AS source,
         '2026-07-16 00:00:00' AS effective_from, NULL AS effective_to, 'USD' AS currency,
         3.00 AS input_per_mtok, NULL AS cache_write_per_mtok, 0.30 AS cache_read_per_mtok,
         15.00 AS output_per_mtok, NULL AS reasoning_per_mtok,
         '2026-08-09' AS version, 'Kimi Code 日志 provider 前缀形态,同 kimi-k3' AS note UNION ALL
  SELECT 'k3', 'exact', NULL, '2026-07-16 00:00:00', NULL, 'USD', 3.00, NULL, 0.30, 15.00, NULL,
         '2026-08-09', '渠道裸 slug(opencode 等),同 kimi-k3' UNION ALL
  SELECT 'gpt-5.5-pro', 'prefix', NULL, '2026-06-01 00:00:00', NULL, 'USD', 30.00, NULL, NULL, 150.00, NULL,
         '2026-08-09', 'OpenAI 标价(CloudZero 2026-07);缓存价未公布' UNION ALL
  SELECT 'gpt-5.5', 'prefix', NULL, '2026-06-01 00:00:00', NULL, 'USD', 5.00, NULL, 0.50, 30.00, NULL,
         '2026-08-09', 'OpenAI 标价(glbgpt 2026-08)' UNION ALL
  SELECT 'gpt-5.4', 'prefix', NULL, '2026-04-01 00:00:00', NULL, 'USD', 2.50, NULL, NULL, 15.00, NULL,
         '2026-08-09', 'OpenAI 标价(pricepertoken 2026-08);缓存价未公布' UNION ALL
  SELECT 'gpt-5.3-codex', 'prefix', NULL, '2026-03-01 00:00:00', NULL, 'USD', 1.75, NULL, NULL, 14.00, NULL,
         '2026-08-09', 'OpenAI 标价(OpenAI 社区帖/llm-stats 2026-07);缓存价未公布' UNION ALL
  SELECT 'glm-5.2', 'prefix', NULL, '2026-06-13 00:00:00', NULL, 'USD', 1.40, NULL, 0.26, 4.40, NULL,
         '2026-08-09', 'Z.ai 官方表(tokencost 核 2026-08)' UNION ALL
  SELECT 'glm-5.1', 'prefix', NULL, '2026-01-01 00:00:00', NULL, 'USD', 1.40, NULL, 0.26, 4.40, NULL,
         '2026-08-09', 'Z.ai 官方表(与 5.2 同价)' UNION ALL
  SELECT 'minimax-m3', 'prefix', NULL, '2026-05-01 00:00:00', NULL, 'USD', 0.60, NULL, NULL, 2.40, NULL,
         '2026-08-09', 'MiniMax 标价(morphllm 2026-06);缓存价未公布' UNION ALL
  SELECT 'gemini-3-flash-preview', 'prefix', NULL, '2026-05-01 00:00:00', NULL, 'USD', 0.25, NULL, NULL, 1.50, NULL,
         '2026-08-09', 'Google 标价(pricepertoken 2026-08)' UNION ALL
  SELECT 'gemini-3-flash', 'prefix', NULL, '2026-05-01 00:00:00', NULL, 'USD', 0.50, NULL, NULL, 3.00, NULL,
         '2026-08-09', 'Google 标价(lumichats 2026-06)'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM usage_model_prices WHERE version = '2026-08-09' LIMIT 1
);
