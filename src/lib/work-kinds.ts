/* 作品类型(单选):卡片 chip、筛选下拉、右栏分布共用。
   hue 用于占位媒体块的渐变底色与 chip tint。 */
export const WORK_KINDS = [
  { id: "app", zh: "软件应用", en: "App", tint: "bg-blue/10 text-blue", dot: "bg-blue", from: "#1A3A66", to: "#0D1522" },
  { id: "miniapp", zh: "小程序", en: "Mini app", tint: "bg-emerald-400/10 text-emerald-400", dot: "bg-emerald-400", from: "#134A3A", to: "#0D1A16" },
  { id: "website", zh: "网站", en: "Website", tint: "bg-teal-400/10 text-teal-300", dot: "bg-teal-400", from: "#0F4A4A", to: "#0A1818" },
  { id: "extension", zh: "插件 / 扩展", en: "Extension", tint: "bg-violet-400/10 text-violet-300", dot: "bg-violet-400", from: "#3A2A66", to: "#150F26" },
  { id: "cli", zh: "CLI 工具", en: "CLI", tint: "bg-slate-400/10 text-slate-300", dot: "bg-slate-400", from: "#2A3444", to: "#0E1218" },
  { id: "skill", zh: "Agent SKILL", en: "Agent SKILL", tint: "bg-amber-400/10 text-amber-400", dot: "bg-amber-400", from: "#5A3A12", to: "#1C1208" },
  { id: "prompt", zh: "Prompt 合集", en: "Prompts", tint: "bg-orange-400/10 text-orange-300", dot: "bg-orange-400", from: "#5A2A12", to: "#1C0E08" },
  { id: "slides", zh: "演示稿", en: "Slides", tint: "bg-rose-400/10 text-rose-300", dot: "bg-rose-400", from: "#5A1A2A", to: "#1C0A10" },
  { id: "demo", zh: "Web 示例", en: "Web demo", tint: "bg-cyan-400/10 text-cyan-300", dot: "bg-cyan-400", from: "#124A5A", to: "#081A20" },
  { id: "content", zh: "教程 / 内容", en: "Content", tint: "bg-lime-400/10 text-lime-300", dot: "bg-lime-400", from: "#3A4A12", to: "#141A08" },
  { id: "other", zh: "其他", en: "Other", tint: "bg-paper/[0.07] text-grey", dot: "bg-grey", from: "#2A2A30", to: "#101014" },
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
