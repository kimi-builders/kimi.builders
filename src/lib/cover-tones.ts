/* 名称砖色调注册表(20260908_works_cover_tone_fit):无配图作品的列表封面。
   theme = 跟随主题的 moon 抬升面;其余为用户指定的固定色——选定后不随主题
   切换,所以全部收敛在「暗底 + 纸字可读」的中低饱和区间(两主题下都成立)。
   增删色档只需改这里:表单色板与 works.cover_tone 白名单都读注册表。 */
export const COVER_TONES = [
  { id: "theme", hex: null, zh: "跟随主题", en: "Theme" },
  { id: "slate", hex: "#3A3F4A", zh: "石墨", en: "Slate" },
  { id: "abyss", hex: "#2A3F66", zh: "深空蓝", en: "Abyss" },
  { id: "moss", hex: "#2E4B3F", zh: "苔绿", en: "Moss" },
  { id: "plum", hex: "#4E3245", zh: "梅子", en: "Plum" },
  { id: "rust", hex: "#5C3A28", zh: "赭石", en: "Rust" },
] as const;

export type CoverToneId = (typeof COVER_TONES)[number]["id"];

export function isCoverTone(id: string): id is CoverToneId {
  return COVER_TONES.some((tone) => tone.id === id);
}

/* theme 返回 null(走 CSS 令牌);固定色返回 hex。 */
export function coverToneHex(id: string): string | null {
  return COVER_TONES.find((tone) => tone.id === id)?.hex ?? null;
}

export function coverToneName(id: string, zh: boolean): string {
  const tone = COVER_TONES.find((item) => item.id === id) ?? COVER_TONES[0];
  return zh ? tone.zh : tone.en;
}

/* Awesome 条目的砖色(awesome 无媒体、无表单色板):按「类型族」定色,
   复用上面五个固定色——一套色板,两条指派路径(作品墙=用户自选,
   Awesome=类型族)。绿=应用,蓝=工具,梅子=智能体,赭石=内容,石墨=其他。 */
const KIND_TONE: Record<string, CoverToneId> = {
  app: "moss",
  miniapp: "moss",
  website: "moss",
  cli: "abyss",
  sdk: "abyss",
  extension: "abyss",
  bot: "plum",
  skill: "plum",
  prompt: "rust",
  slides: "rust",
  demo: "rust",
  content: "rust",
  other: "slate",
};

export function awesomeToneFor(kind: string): CoverToneId {
  return KIND_TONE[kind] ?? "slate";
}
