/* 作品类型(单选):卡片 chip、筛选下拉、右栏分布共用。
   类别差异由 WorkKindIcon + 文字标签表达；颜色严格走全局令牌。 */
export const WORK_KINDS = [
  { id: "app", zh: "软件应用", en: "App", tint: "bg-paper/[0.04] text-grey" },
  { id: "miniapp", zh: "小程序", en: "Mini app", tint: "bg-paper/[0.04] text-grey" },
  { id: "website", zh: "网站", en: "Website", tint: "bg-paper/[0.04] text-grey" },
  { id: "extension", zh: "插件 / 扩展", en: "Extension", tint: "bg-paper/[0.04] text-grey" },
  { id: "cli", zh: "CLI 工具", en: "CLI", tint: "bg-paper/[0.04] text-grey" },
  { id: "sdk", zh: "SDK / 库", en: "SDK / Lib", tint: "bg-paper/[0.04] text-grey" },
  { id: "bot", zh: "机器人", en: "Bot", tint: "bg-paper/[0.04] text-grey" },
  { id: "skill", zh: "Agent SKILL", en: "Agent SKILL", tint: "bg-paper/[0.04] text-grey" },
  { id: "prompt", zh: "Prompt 合集", en: "Prompts", tint: "bg-paper/[0.04] text-grey" },
  { id: "slides", zh: "演示稿", en: "Slides", tint: "bg-paper/[0.04] text-grey" },
  { id: "demo", zh: "Web 示例", en: "Web demo", tint: "bg-paper/[0.04] text-grey" },
  { id: "content", zh: "教程 / 内容", en: "Content", tint: "bg-paper/[0.04] text-grey" },
  { id: "other", zh: "其他", en: "Other", tint: "bg-paper/[0.07] text-grey" },
] as const;

export type WorkKindId = (typeof WORK_KINDS)[number]["id"];

export function isWorkKind(id: string): id is WorkKindId {
  return WORK_KINDS.some((k) => k.id === id);
}

export function workKind(id: string) {
  return WORK_KINDS.find((k) => k.id === id) ?? WORK_KINDS[WORK_KINDS.length - 1];
}

export function workKindLabel(id: string, zh: boolean): string {
  const k = workKind(id);
  return zh ? k.zh : k.en;
}
