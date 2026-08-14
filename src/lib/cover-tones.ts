/* 名称砖色调注册表(20260908_works_cover_tone_fit;20260914 换暖纯色系):
   无配图作品的列表封面。theme = 跟随主题(深空/温暖白,globals.css
   .work-cover-tile);其余为用户指定的固定暖纯色——选定后不随主题切换,
   全部收敛在「暗底 + 纸字 #EFE8DC 可读」的中低明度区间。
   增删色档只需改这里:表单色板与 works.cover_tone 白名单都读注册表。
   旧色档 id(slate/abyss/plum/rust)由迁移 20260914 映射到相近新色。 */
export const COVER_TONES = [
  { id: "theme", hex: null, zh: "跟随主题", en: "Theme" },
  { id: "apricot", hex: "#8A5A1E", zh: "杏黄", en: "Apricot" },
  { id: "terracotta", hex: "#A04A2E", zh: "赤陶", en: "Terracotta" },
  { id: "maple", hex: "#9C3B45", zh: "枫红", en: "Maple" },
  { id: "moss", hex: "#556B2F", zh: "苔绿", en: "Moss" },
  { id: "graphite", hex: "#3F444C", zh: "石墨", en: "Graphite" },
] as const;

export type CoverToneId = (typeof COVER_TONES)[number]["id"];

export function isCoverTone(id: string): id is CoverToneId {
  return COVER_TONES.some((tone) => tone.id === id);
}

/* theme 返回 null(走 .work-cover-tile 主题样式);固定色返回 hex。 */
export function coverToneHex(id: string): string | null {
  return COVER_TONES.find((tone) => tone.id === id)?.hex ?? null;
}

export function coverToneName(id: string, zh: boolean): string {
  const tone = COVER_TONES.find((item) => item.id === id) ?? COVER_TONES[0];
  return zh ? tone.zh : tone.en;
}

/* Awesome 条目的砖色(awesome 无媒体、色板未选时):按「类型族」定色,
   复用上面五个固定色——一套色板,两条指派路径(作品墙=用户自选,
   Awesome=类型族)。绿=应用,杏黄=工具,枫红=智能体,赤陶=内容,石墨=其他。 */
const KIND_TONE: Record<string, CoverToneId> = {
  app: "moss",
  miniapp: "moss",
  website: "moss",
  cli: "apricot",
  sdk: "apricot",
  extension: "apricot",
  bot: "maple",
  skill: "maple",
  prompt: "terracotta",
  slides: "terracotta",
  demo: "terracotta",
  content: "terracotta",
  other: "graphite",
};

export function awesomeToneFor(kind: string): CoverToneId {
  return KIND_TONE[kind] ?? "graphite";
}
