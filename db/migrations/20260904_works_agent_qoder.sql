-- 作品 Agent 注册表修正:Qwen 只是模型族,阿里主推的 Agentic IDE 是 Qoder。
-- works.agents 是 JSON 数组文本,精确替换带引号的 id 即可,不误伤子串。
UPDATE works SET agents = REPLACE(agents, '"qwen"', '"qoder"')
WHERE agents LIKE '%"qwen"%';
