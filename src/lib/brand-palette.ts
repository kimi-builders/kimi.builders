/* 品牌令牌色板 —— OG 图 / 分享海报(Satori JSX→图片)的内联色单一事实源。
   来源:kimi-brand 设计系统 tokens/kimi-tokens.css|json(2026-08-18 快照,
   官网品牌页 https://www.kimi.ai/zh-hans/resources/kimi-brand)。
   置信标注沿用来源约定:【官方】=品牌页色板直接给出;【建议】=官方色到用途的映射。
   Satori 不支持 CSS 变量,海报组件一律从这里取色,不要另写色值。 */

/** 官方品牌色原值(品牌 15 色 + 数字界面蓝)。 */
export const BRAND = {
  blueDeep: "#002F5B", // 深蓝:深度信息层、深色强调【官方】
  blue: "#007CFF", // 焦点蓝:唯一高饱和焦点(PANTONE 2387C)【官方】
  blueBright: "#00A1FF", // 亮蓝:同类构成区分、次级蓝【官方】
  blueSoft: "#A0DAF7", // 浅蓝:大面积蓝色氛围、背景阶【官方】
  cyan: "#00F6FF", // 青:数字肌理、De-coding 纹理强调【官方】
  signalBlue: "#1783FF", // 数字信号蓝 / Logo 蓝点【官方】
  uiBlue: "#1A88FF", // UI 蓝(暗色端交互)【官方】
  mint: "#B3F4A8", // 绿 pastel:正向状态【官方】
  pink: "#FFD1D4", // 粉 pastel:负向状态【官方】
  lemon: "#F4F9A7", // 黄 pastel:警示级点缀【官方】
  ink: "#121212", // 主文字 / 深色背景【官方】
  grey1: "#707070", // 次级文字【官方】
  grey2: "#8D9390", // 中性过渡、弱化元素【官方】
  grey3: "#C3C3C3", // 比较对象、非焦点系列【官方】
  grey4: "#E1E3E6", // 网格线、分隔、边界(浅底)【官方】
  paper: "#FFFFFF", // 浅色背景 / 深底主文字【官方】
} as const;

/** 深色海报语义色板:官方色 → 海报角色【建议:角色映射】。
   暗色中性层级(#181818 / #1A1A1A / #343434)来自官方令牌深色语义层
   (--kimi-dark-grid-line)与站点 globals.css 的 --color-viz-surface,非自造色。 */
export const POSTER_PALETTE = {
  background: BRAND.ink, // 海报底(替代自造 #050607)
  surface: "#181818", // viz-surface:条形轨道 / 空热格 / 图标底
  paper: BRAND.paper, // 深底主文字(替代 #f4f6f8)
  muted: BRAND.grey2, // 次级文字 / 标签 / 刻度(#8a9099 的官方对应)
  line: "#343434", // 分隔线 / 描边(官方深色 grid line【建议】)
  grid: "#1A1A1A", // 图表网格线 / 空格描边 / 虚线(暗色面板阶)
  blue: BRAND.blue, // 焦点蓝:主数据系列 / 关键数字(替代 #1478ff)
  blueBright: BRAND.blueBright, // 亮蓝:次级蓝强调 / 柱顶亮条 / 链接(替代 #54a3ff)
  green: BRAND.mint, // 正向状态:费用 / 缓存 / 第一名(替代自造 #20d39a)
  greenInk: BRAND.ink, // pastel 底上的文字(替代 #03291f)
  amber: BRAND.lemon, // 警示 / 推理(替代自造 #f6a609)
  seriesNeutral: "#3A3A3A", // 深色非焦点系列(官方 dark series neutral【建议】)
} as const;

/** 官方色的 alpha 衍生(Satori 无 color-mix,显式写出;基色全部是 BRAND 原值)。 */
export const POSTER_ALPHA = {
  focusGlow10: "rgba(0,124,255,0.10)", // 海报底右上径向泛光
  focusBorder25: "rgba(0,124,255,0.25)", // 热力数据格描边
  paper72: "rgba(255,255,255,0.72)", // 堆叠柱-输出段
  paper50: "rgba(255,255,255,0.5)", // 7 日均值虚线
  ink40: "rgba(18,18,18,0.4)", // mint 底上的点纹图案
  ink0: "rgba(18,18,18,0)", // 渐变消隐端
} as const;

/** 热力 5 级:level 0 无数据走中性 surface(近底隐形),1-4 走官方蓝阶递增
   (蓝阶同站点 globals.css 暗色 --color-viz-sequential-2..5)。 */
export const POSTER_HEAT_SCALE: string[] = [
  POSTER_PALETTE.surface,
  BRAND.blue,
  BRAND.blueBright,
  BRAND.blueSoft,
  BRAND.cyan,
];

/** 分时热图 6 档:焦点蓝 alpha 渐近,末端实色(阈值分档见 UsageSharePoster.heatStep)。 */
export const POSTER_HEAT_STEPS: string[] = [
  "rgba(0,124,255,0.15)",
  "rgba(0,124,255,0.30)",
  "rgba(0,124,255,0.45)",
  "rgba(0,124,255,0.60)",
  "rgba(0,124,255,0.80)",
  BRAND.blue,
];
