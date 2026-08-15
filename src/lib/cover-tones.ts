/* 名称砖色调注册表(20260908 引入;20260916 起为 跟随主题/绿/蓝/红/黑 纯平色卡,
   参考 Laracasts 礼物卡的绿卡/蓝卡/红卡/黑卡):
   无上传封面作品的列表封面。theme = 跟随主题(深空/站点白,globals.css
   .work-cover-tile);其余为固定纯平色——选定后不随主题切换,
   全部保证纸字 #EFE8DC 可读。
   增删色档只需改这里:表单色板与 works.cover_tone 白名单都读注册表。
   旧色档 id 由迁移 20260916 映射到绿/蓝/红/黑。 */
export const COVER_TONES = [
  { id: "theme", hex: null, zh: "跟随主题", en: "Theme" },
  { id: "green", hex: "#2E6B4E", zh: "绿卡", en: "Green" },
  { id: "blue", hex: "#2456A6", zh: "蓝卡", en: "Blue" },
  { id: "red", hex: "#A63642", zh: "红卡", en: "Red" },
  { id: "black", hex: "#26262B", zh: "黑卡", en: "Black" },
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
   复用上面四张色卡——一套色板,两条指派路径(作品墙=用户自选,
   Awesome=类型族)。绿=应用,蓝=工具,红=智能体,黑=内容与其他。 */
const KIND_TONE: Record<string, CoverToneId> = {
  app: "green",
  miniapp: "green",
  website: "green",
  cli: "blue",
  sdk: "blue",
  extension: "blue",
  bot: "red",
  skill: "red",
  prompt: "black",
  slides: "black",
  demo: "black",
  content: "black",
  other: "black",
};

export function awesomeToneFor(kind: string): CoverToneId {
  return KIND_TONE[kind] ?? "black";
}
