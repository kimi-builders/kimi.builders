/* 作品类型(单选):卡片 chip、筛选下拉、右栏分布共用。
   类别差异由 WorkKindIcon + 文字标签表达；颜色严格走全局令牌。 */
export const WORK_KINDS = [
  { id: "app", zh: "软件应用", en: "App", tint: "bg-blue/10 text-blue" },
  { id: "miniapp", zh: "小程序", en: "Mini app", tint: "bg-blue/10 text-blue" },
  { id: "website", zh: "网站", en: "Website", tint: "bg-blue/10 text-blue" },
  { id: "extension", zh: "插件 / 扩展", en: "Extension", tint: "bg-blue/10 text-blue" },
  { id: "cli", zh: "CLI 工具", en: "CLI", tint: "bg-blue/10 text-blue" },
  { id: "skill", zh: "Agent SKILL", en: "Agent SKILL", tint: "bg-blue/10 text-blue" },
  { id: "prompt", zh: "Prompt 合集", en: "Prompts", tint: "bg-blue/10 text-blue" },
  { id: "slides", zh: "演示稿", en: "Slides", tint: "bg-blue/10 text-blue" },
  { id: "demo", zh: "Web 示例", en: "Web demo", tint: "bg-blue/10 text-blue" },
  { id: "content", zh: "教程 / 内容", en: "Content", tint: "bg-blue/10 text-blue" },
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
