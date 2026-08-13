-- codebuddy 并入 workbuddy(腾讯主推名;collector 上报用 workbuddy)。
-- 保险性改写:该 id 上线不足一天,预期零命中。
UPDATE works SET agents = REPLACE(agents, '"codebuddy"', '"workbuddy"')
WHERE agents LIKE '%"codebuddy"%';
UPDATE usage_buckets SET source = 'workbuddy' WHERE source = 'codebuddy';
UPDATE usage_sessions SET source = 'workbuddy' WHERE source = 'codebuddy';
