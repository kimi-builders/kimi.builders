/* 名称砖色调注册表(20260908 引入;20260916 起为 跟随主题/绿/蓝/黑 纯平色卡;
   20260918 双主题化;20260819 色值换入 Kimi 品牌体系,不再自造色相):
   无上传封面作品的列表封面。色值全部取自品牌手册——蓝 = 官方深蓝/浅蓝对
   (#002F5B / #A0DAF7),绿档改薄荷(官方状态绿 #B3F4A8 + ink 字,双主题同渲染),
   黑 = 官方 CLI 纯黑 #000 / ink #121212。id 不变(theme/green/blue/black),
   存量 works.cover_tone 零迁移,色板即所得。
   theme = 跟随主题(深空/站点白,globals.css .work-cover-tile);固定色 = 砖色
   随主题切换(globals.css 的 .work-tone-* 类,响应式跟随 data-theme,
   JS 侧只发类名;本表 hex 仅为文档对照,渲染以 CSS 为准)。
   增删色档:改这里 + globals.css 对应类;表单色板与 works.cover_tone 白名单读注册表。
   旧色档 id 由迁移 20260916 映射到绿/蓝/黑。 */
export const COVER_TONES = [
  { id: "theme", dark: null, light: null, zh: "跟随主题", en: "Theme" },
  { id: "green", dark: "#B3F4A8", light: "#B3F4A8", zh: "薄荷卡", en: "Mint" },
  { id: "blue", dark: "#002F5B", light: "#A0DAF7", zh: "蓝卡", en: "Blue" },
  { id: "black", dark: "#000000", light: "#121212", zh: "黑卡", en: "Black" },
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

/* 名称砖纹理变体(20260821 评审):色档保持少而重(三固定色 + theme),
   密度上来后同色砖重复率高、视觉节奏单调;按砖面标识(产品名)稳定哈希,
   让约一半砖带细网格纹理(.work-tile-grid,色档与主题渲染都在 CSS),
   同名砖保持同纹理(名称砖本就按名生成)。纯函数,单测直接测。 */
export function coverTextureClass(key: string): "work-tile-grid" | null {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? "work-tile-grid" : null;
}
