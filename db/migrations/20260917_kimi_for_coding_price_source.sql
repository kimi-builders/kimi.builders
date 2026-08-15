-- kimi-for-coding 补溯源字段(20260917):20260915 补价时漏了 pricing_source_url /
-- verified_at(该表要求每行都可溯源;usage-phase2 集成测试以此计数)。
-- 口径不变:按 kimi-k2.7-code 标准 API 价估算,来源同为 Moonshot 平台价格页。
UPDATE usage_model_prices
SET pricing_source_url = 'https://platform.kimi.ai/docs/pricing/chat',
    verified_at = '2026-08-14'
WHERE model_pattern = 'kimi-for-coding' AND pricing_source_url = '';
