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
