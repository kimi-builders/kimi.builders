/* 名称砖色调注册表(20260908 引入;20260916 起为 跟随主题/绿/蓝/红/黑 纯平色卡;
   20260918 双主题化 + 降饱和统一色温,红档同日下线——实测观感不佳,存量 red
   由迁移 20260918 归并为黑):无上传封面作品的列表封面。
   theme = 跟随主题(深空/站点白,globals.css .work-cover-tile);固定色 = 砖色
   随主题切换——深色取降饱和深调(与站点近黑底同一色温),浅色取同色相淡染
   (深色文字),色值都在 globals.css 的 .work-tone-* 类里(响应式跟随 data-theme,
   JS 侧只发类名)。蓝档向站点蓝族靠拢,绿档压深,黑档贴 moon 层次。
   增删色档:改这里 + globals.css 对应类;表单色板与 works.cover_tone 白名单读注册表。
   旧色档 id 由迁移 20260916 映射到绿/蓝/红/黑。 */
export const COVER_TONES = [
  { id: "theme", dark: null, light: null, zh: "跟随主题", en: "Theme" },
  { id: "green", dark: "#1E4D3A", light: "#E3EDE7", zh: "绿卡", en: "Green" },
  { id: "blue", dark: "#153E75", light: "#E2EBF8", zh: "蓝卡", en: "Blue" },
  { id: "black", dark: "#232329", light: "#ECECEF", zh: "黑卡", en: "Black" },
] as const;

export type CoverToneId = (typeof COVER_TONES)[number]["id"];

export function isCoverTone(id: string): id is CoverToneId {
  return COVER_TONES.some((tone) => tone.id === id);
}

/* theme 返回 null(走 .work-cover-tile 主题样式);固定色返回 globals.css
   里的色调类(.work-tone 公共层 + .work-tone-{id} 色档,含浅色覆盖)。 */
export function coverToneClass(id: string): string | null {
  return isCoverTone(id) && id !== "theme" ? `work-tone work-tone-${id}` : null;
}

export function coverToneName(id: string, zh: boolean): string {
  const tone = COVER_TONES.find((item) => item.id === id) ?? COVER_TONES[0];
  return zh ? tone.zh : tone.en;
}

/* Awesome 条目的砖色(awesome 无媒体、色板未选时):按「类型族」定色,
   复用上面三张色卡——一套色板,两条指派路径(作品墙=用户自选,
   Awesome=类型族)。绿=应用,蓝=工具,黑=智能体/内容与其他
   (红档 20260918 下线,原红的智能体族并入黑)。 */
const KIND_TONE: Record<string, CoverToneId> = {
  app: "green",
  miniapp: "green",
  website: "green",
  cli: "blue",
  sdk: "blue",
  extension: "blue",
  bot: "black",
  skill: "black",
  prompt: "black",
  slides: "black",
  demo: "black",
  content: "black",
  other: "black",
};

export function awesomeToneFor(kind: string): CoverToneId {
  return KIND_TONE[kind] ?? "black";
}
