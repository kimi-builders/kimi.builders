-- Codex / GPT-5.6 价格补全(2026-08-11)。
-- 官方来源:
--   https://developers.openai.com/api/docs/pricing
--   https://developers.openai.com/api/docs/changelog
--
-- GPT-5.6 于 2026-07-09 发布；Sol 标准价保持不变。
-- Terra/Luna 于 2026-07-30 分别降价 20% / 80%，因此保留两个历史窗口。
-- codex-auto-review 是 Codex 本地日志中的内部用途名，公开价格表没有同名模型；
-- 参考 Codex 账目使用 gpt-5.4 标准等价费率，并限制 source='codex'，避免跨工具误匹配。
--
-- cache_write_per_mtok:
--   GPT-5.6 官方表单列出显式缓存写价；auto-review/gpt-5.4 未列出，保持 NULL，
--   由服务端既有规则回退到普通 input 价。

INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_read_per_mtok, output_per_mtok,
   reasoning_per_mtok, version, note)
SELECT seed.*
FROM (
  SELECT 'gpt-5.6' AS model_pattern,
         'prefix' AS match_kind,
         NULL AS source,
         '2026-07-09 00:00:00' AS effective_from,
         NULL AS effective_to,
         'USD' AS currency,
         5.00 AS input_per_mtok,
         6.25 AS cache_write_per_mtok,
         0.50 AS cache_read_per_mtok,
         30.00 AS output_per_mtok,
         NULL AS reasoning_per_mtok,
         '2026-08-11' AS version,
         'OpenAI 官方 Standard 价；裸 gpt-5.6 alias 路由到 Sol' AS note UNION ALL
  SELECT 'gpt-5.6-terra', 'prefix', NULL, '2026-07-09 00:00:00', '2026-07-30 00:00:00', 'USD',
         2.50, 3.125, 0.25, 15.00, NULL, '2026-08-11',
         'OpenAI 官方 Standard 价；2026-07-30 降价前窗口' UNION ALL
  SELECT 'gpt-5.6-terra', 'prefix', NULL, '2026-07-30 00:00:00', NULL, 'USD',
         2.00, 2.50, 0.20, 12.00, NULL, '2026-08-11',
         'OpenAI 官方 Standard 价；2026-07-30 起降价 20%' UNION ALL
  SELECT 'gpt-5.6-luna', 'prefix', NULL, '2026-07-09 00:00:00', '2026-07-30 00:00:00', 'USD',
         1.00, 1.25, 0.10, 6.00, NULL, '2026-08-11',
         'OpenAI 官方 Standard 价；2026-07-30 降价前窗口' UNION ALL
  SELECT 'gpt-5.6-luna', 'prefix', NULL, '2026-07-30 00:00:00', NULL, 'USD',
         0.20, 0.25, 0.02, 1.20, NULL, '2026-08-11',
         'OpenAI 官方 Standard 价；2026-07-30 起降价 80%' UNION ALL
  SELECT 'codex-auto-review', 'exact', 'codex', '2026-04-01 00:00:00', NULL, 'USD',
         2.50, NULL, 0.25, 15.00, NULL, '2026-08-11',
         'Codex 内部用途名；按 gpt-5.4 Standard 等价费率估算'
) AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM usage_model_prices existing
  WHERE existing.model_pattern = seed.model_pattern
    AND existing.match_kind = seed.match_kind
    AND existing.source <=> seed.source
    AND existing.effective_from = seed.effective_from
);
