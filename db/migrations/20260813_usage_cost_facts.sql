-- Usage cost facts v5: request pricing dimensions, cache-write TTL partitions,
-- price provenance, and confidence-aware device metadata.
-- Deployment order: migration -> site -> Collector 0.4.x.

ALTER TABLE usage_buckets
  DROP INDEX uq_usage_bucket,
  ADD COLUMN context_tier VARCHAR(16) NOT NULL DEFAULT '' AFTER agent_version,
  ADD COLUMN processing_tier VARCHAR(16) NOT NULL DEFAULT '' AFTER context_tier,
  ADD COLUMN cache_write_5m_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0
    AFTER cache_write_input_tokens,
  ADD COLUMN cache_write_1h_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0
    AFTER cache_write_5m_input_tokens,
  ADD UNIQUE KEY uq_usage_bucket
    (user_id, device_id, source, model, model_provider, reasoning_effort,
     agent_version, context_tier, processing_tier, project_hash, bucket_start),
  ADD KEY idx_usage_bucket_context_time (user_id, context_tier, bucket_start);

ALTER TABLE usage_model_prices
  ADD COLUMN context_tier VARCHAR(16) NOT NULL DEFAULT '' AFTER source,
  ADD COLUMN processing_tier VARCHAR(16) NOT NULL DEFAULT 'standard' AFTER context_tier,
  ADD COLUMN cache_write_5m_per_mtok DECIMAL(18,6) NULL AFTER cache_write_per_mtok,
  ADD COLUMN cache_write_1h_per_mtok DECIMAL(18,6) NULL AFTER cache_write_5m_per_mtok,
  ADD COLUMN pricing_source_url VARCHAR(500) NOT NULL DEFAULT '' AFTER version,
  ADD COLUMN verified_at DATE NULL AFTER pricing_source_url,
  ADD COLUMN pricing_basis VARCHAR(40) NOT NULL DEFAULT 'standard-api' AFTER verified_at;

ALTER TABLE usage_devices
  ADD COLUMN terminal_confidence VARCHAR(16) NOT NULL DEFAULT 'unknown' AFTER terminal_version;

-- Provider-published cache TTL multipliers: 5m=1.25x, 1h=2x base input.
UPDATE usage_model_prices
SET cache_write_5m_per_mtok = input_per_mtok * 1.25,
    cache_write_1h_per_mtok = input_per_mtok * 2,
    pricing_source_url = 'https://platform.claude.com/docs/en/about-claude/pricing',
    verified_at = '2026-08-08',
    pricing_basis = 'standard-api'
WHERE model_pattern LIKE 'claude-%';

UPDATE usage_model_prices
SET pricing_source_url = 'https://developers.openai.com/api/docs/pricing',
    verified_at = '2026-08-08',
    pricing_basis = 'standard-api'
WHERE model_pattern LIKE 'gpt-%' OR model_pattern LIKE 'codex-%';

UPDATE usage_model_prices
SET pricing_source_url = 'https://ai.google.dev/gemini-api/docs/pricing',
    verified_at = '2026-08-08',
    pricing_basis = 'standard-api'
WHERE model_pattern LIKE 'gemini-%';

UPDATE usage_model_prices
SET pricing_source_url = 'https://platform.kimi.ai/docs/pricing/chat',
    verified_at = '2026-08-08',
    pricing_basis = 'standard-api'
WHERE model_pattern LIKE 'kimi-%'
   OR model_pattern = 'k3';

UPDATE usage_model_prices
SET pricing_source_url = 'https://docs.z.ai/guides/overview/pricing',
    verified_at = '2026-08-08',
    pricing_basis = 'standard-api'
WHERE model_pattern LIKE 'glm-%';

UPDATE usage_model_prices
SET pricing_source_url = 'https://platform.minimax.io/docs/guides/pricing-paygo',
    verified_at = '2026-08-08',
    pricing_basis = 'standard-api'
WHERE model_pattern LIKE 'minimax-%';

-- GPT-5.6 short-context rows already exist in v4. Mark them explicitly;
-- the matcher treats missing historical context as an assumed short tier and
-- reports that assumption instead of presenting it as an exact match.
UPDATE usage_model_prices
SET context_tier = 'short',
    cache_write_5m_per_mtok = cache_write_per_mtok,
    pricing_source_url = 'https://developers.openai.com/api/docs/models',
    verified_at = '2026-08-08',
    pricing_basis = 'standard-api'
WHERE version = '2026-08-11' AND model_pattern LIKE 'gpt-5.6%';

-- Requests above 272K prompt input tokens are billed at 2x input/cache and
-- 1.5x output for the full request. Source rows mirror every historical v4
-- window so old dates still select the price active at that time.
INSERT INTO usage_model_prices
  (model_pattern, match_kind, source, context_tier, processing_tier,
   effective_from, effective_to, currency,
   input_per_mtok, cache_write_per_mtok, cache_write_5m_per_mtok,
   cache_write_1h_per_mtok, cache_read_per_mtok, output_per_mtok,
   reasoning_per_mtok, version, pricing_source_url, verified_at,
   pricing_basis, note)
SELECT model_pattern, match_kind, source, 'long', 'standard',
       effective_from, effective_to, currency,
       input_per_mtok * 2, cache_write_per_mtok * 2,
       cache_write_per_mtok * 2, NULL,
       cache_read_per_mtok * 2, output_per_mtok * 1.5,
       CASE WHEN reasoning_per_mtok IS NULL THEN NULL ELSE reasoning_per_mtok * 1.5 END,
       '2026-08-13', 'https://developers.openai.com/api/docs/models',
       '2026-08-08', 'standard-api',
       CONCAT(note, '; >272K prompt input tier')
FROM usage_model_prices short_price
WHERE short_price.version = '2026-08-11'
  AND short_price.model_pattern LIKE 'gpt-5.6%'
  AND NOT EXISTS (
    SELECT 1 FROM usage_model_prices existing
    WHERE existing.model_pattern = short_price.model_pattern
      AND existing.match_kind = short_price.match_kind
      AND existing.source <=> short_price.source
      AND existing.context_tier = 'long'
      AND existing.processing_tier = 'standard'
      AND existing.effective_from = short_price.effective_from
  );
