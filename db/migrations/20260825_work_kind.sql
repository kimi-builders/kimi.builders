-- 作品类型维度(2026-08,作品+Awesome 精细化迭代):
--   kind 作品类型(单选):app 软件应用 / miniapp 小程序 / website 网站 / extension 插件扩展 /
--     cli 命令行 / skill Agent SKILL / prompt Prompt 合集 / slides 演示稿 / demo Web 示例 /
--     content 教程内容 / other 其他。卡片 chip、筛选器与右栏「类型分布」共用。
--   platforms 列上线后证明价值不高(与 kind 语义重叠且更粗),拿下,由 kind 承接。

ALTER TABLE works
  ADD COLUMN kind VARCHAR(24) NOT NULL DEFAULT 'app' COMMENT '作品类型:app/miniapp/website/extension/cli/skill/prompt/slides/demo/content/other' AFTER scope,
  DROP COLUMN platforms;
